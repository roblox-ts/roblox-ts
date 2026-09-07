import { PathTranslator } from "@roblox-ts/path-translator";
import path from "path";
import { createProjectData } from "Project/functions/createProjectData";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { parseProjectConfig } from "Project/functions/parseProjectConfig";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectData, ProjectOptions } from "Shared/types";
import { assert } from "Shared/util/assert";
import { findAncestorDir } from "Shared/util/findAncestorDir";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import { getRootDirs } from "Shared/util/getRootDirs";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import ts from "typescript";

export function projectPathKey(filePath: string) {
	return getCanonicalFileName(path.normalize(filePath));
}

export interface ProjectNode {
	data: ProjectData;
	config: ts.ParsedCommandLine;
	dependencies: Array<string>;
	pathTranslator: PathTranslator | undefined;
}

export class ProjectGraph {
	public readonly projects = new Map<string, ProjectNode>();
	public readonly configPaths: Set<string>;
	public readonly root: ProjectNode;

	constructor(tsConfigPath: string, overrides: Partial<ProjectOptions>, configPaths = new Set<string>()) {
		this.configPaths = configPaths;

		const explicitOptions: Partial<ProjectOptions> = {};
		for (const key of Object.keys(DEFAULT_PROJECT_OPTIONS) as Array<keyof ProjectOptions>) {
			if (overrides[key] !== undefined) {
				Object.assign(explicitOptions, { [key]: overrides[key] });
			}
		}

		const configs = new Map<string, ts.ParsedCommandLine>();
		const host = ts.createSolutionBuilderHost();
		host.getParsedCommandLine = configPath => {
			this.configPaths.add(path.normalize(configPath));

			const config = parseProjectConfig(configPath);
			configs.set(projectPathKey(configPath), config);

			const configFile = config.options.configFile;
			assert(configFile);
			for (const extendedPath of configFile.extendedSourceFiles ?? []) {
				this.configPaths.add(path.normalize(extendedPath));
			}

			return config;
		};

		// reuse TypeScript's config resolution, deduplication, and cycle diagnostics without its JavaScript emitter
		const order = ts.createSolutionBuilder(host, [tsConfigPath], {}).getBuildOrder();
		if (ts.isCircularBuildOrder(order)) {
			throw new DiagnosticError(order.circularDiagnostics);
		}

		const rootConfig = configs.get(projectPathKey(tsConfigPath));
		assert(rootConfig);

		const rootOptions = { ...DEFAULT_PROJECT_OPTIONS, ...rootConfig.raw.rbxts, ...explicitOptions };
		const rootData = createProjectData(tsConfigPath, rootOptions);

		for (const configPath of order) {
			const key = projectPathKey(configPath);
			const config = configs.get(key);
			assert(config);

			const data =
				key === projectPathKey(tsConfigPath)
					? rootData
					: createProjectData(configPath, {
							...DEFAULT_PROJECT_OPTIONS,
							...rootConfig.raw.rbxts,
							...config.raw.rbxts,
							...explicitOptions,

							noInclude: true,
							includePath: rootData.projectOptions.includePath,
							rojo: rootData.rojoConfigPath,
						});

			let pathTranslator: PathTranslator | undefined;
			if (!ts.isSolutionConfig(config)) {
				getParsedCommandLine(data, config);

				const rootDir = findAncestorDir([
					ts.getCommonSourceDirectoryOfConfig(config, !ts.sys.useCaseSensitiveFileNames),
					...getRootDirs(config.options),
				]);
				assert(config.options.outDir);

				const buildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(config.options);

				pathTranslator = new PathTranslator(
					rootDir,
					path.normalize(config.options.outDir),
					buildInfoPath && path.normalize(buildInfoPath),
					ts.getEmitDeclarations(config.options),
					data.projectOptions.luau,
				);
			}

			this.projects.set(key, {
				data,
				config,
				pathTranslator,
				dependencies: (config.projectReferences ?? []).map(ref =>
					projectPathKey(ts.resolveProjectReferencePath(ref)),
				),
			});
		}

		const root = this.projects.get(projectPathKey(tsConfigPath));
		assert(root);
		this.root = root;

		this.validateReferences();
		this.mapReferencePaths();
	}

	private validateReferences() {
		for (const project of this.projects.values()) {
			for (const dependency of project.dependencies) {
				const target = this.projects.get(dependency);
				assert(target);
				if (!target.pathTranslator) {
					continue;
				}

				const { options } = target.config;
				if (!options.composite) {
					throw new DiagnosticError([
						ts.createCompilerDiagnostic(
							ts.Diagnostics.Referenced_project_0_must_have_setting_composite_Colon_true,
							target.data.tsConfigPath,
						),
					]);
				}

				if (options.noEmit || options.declaration === false) {
					throw new DiagnosticError([
						ts.createCompilerDiagnostic(
							ts.Diagnostics.Referenced_project_0_may_not_disable_emit,
							target.data.tsConfigPath,
						),
					]);
				}
			}
		}
	}

	private mapReferencePaths() {
		for (const project of this.projects.values()) {
			const paths = new Map<string, string>();
			const visited = new Set<string>();

			const visit = (key: string) => {
				if (visited.has(key)) {
					return;
				}
				visited.add(key);

				const reference = this.projects.get(key);
				assert(reference);

				for (const dependency of reference.dependencies) {
					visit(dependency);
				}

				const translator = reference.pathTranslator;
				if (!translator) {
					return;
				}

				for (const fileName of reference.config.fileNames) {
					if (ts.isDeclarationFileName(fileName) && !isPathDescendantOf(fileName, translator.rootDir)) {
						continue;
					}

					const outputPath = translator.getImportPath(fileName);
					paths.set(projectPathKey(fileName), outputPath);

					if (!ts.isDeclarationFileName(fileName) && !fileName.endsWith(".json")) {
						const declarationPath = ts.getOutputDeclarationFileName(
							fileName,
							reference.config,
							!ts.sys.useCaseSensitiveFileNames,
						);
						paths.set(projectPathKey(declarationPath), outputPath);
					}
				}
			};

			for (const dependency of project.dependencies) {
				visit(dependency);
			}

			project.data.projectReferencePaths = paths;
		}
	}
}
