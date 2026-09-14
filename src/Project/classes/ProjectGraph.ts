import { PathTranslator } from "@roblox-ts/path-translator";
import path from "path";
import { createProjectData } from "Project/functions/createProjectData";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { getRojoProject } from "Project/functions/getRojoProject";
import { parseProjectConfig } from "Project/functions/parseProjectConfig";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectData, ProjectOptions } from "Shared/types";
import { assert } from "Shared/util/assert";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";
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
	tsBuildInfoPath: string | undefined;
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
		const tsBuildInfoPaths = new Map<string, string>();
		const host = ts.createSolutionBuilderHost();
		host.getParsedCommandLine = configPath => {
			this.configPaths.add(path.normalize(configPath));

			const config = parseProjectConfig(configPath);
			const tsBuildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(config.options);
			if (tsBuildInfoPath !== undefined) {
				tsBuildInfoPaths.set(projectPathKey(configPath), path.normalize(tsBuildInfoPath));
				const basePath = tsBuildInfoPath.endsWith(".tsbuildinfo")
					? tsBuildInfoPath.slice(0, -".tsbuildinfo".length)
					: tsBuildInfoPath;
				// tsc and rbxtsc use different source hashes and must not overwrite each other's cache
				config.options.tsBuildInfoFile = `${basePath}.rbxtsc.tsbuildinfo`;
			}
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
							rojo: config.raw.rbxts.rojo ?? rootData.rojoConfigPath,
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
				tsBuildInfoPath: tsBuildInfoPaths.get(key),
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
		this.refreshRojoProjects();
	}

	public refreshRojoProjects() {
		const rojoProjects = new Map<string, ReturnType<typeof getRojoProject>>();
		for (const { data } of this.projects.values()) {
			if (!data.rojoConfigPath) {
				continue;
			}
			// retain newly selected paths even when the project file has not been created yet
			this.configPaths.add(data.rojoConfigPath);
			const key = projectPathKey(data.rojoConfigPath);
			let rojo = rojoProjects.get(key);
			if (!rojo) {
				rojo = getRojoProject(data.rojoConfigPath);
				rojoProjects.set(key, rojo);
			}
			Object.assign(data, rojo);
		}
		this.validateReferenceRojoPaths();
	}

	private validateReferenceRojoPaths() {
		for (const project of this.projects.values()) {
			for (const key of project.dependencies) {
				const reference = this.projects.get(key);
				assert(reference);
				const owner = reference.data.rojoResolver;
				const consumer = project.data.rojoResolver;
				if (!reference.pathTranslator || !owner || owner === consumer || !reference.config.raw.rbxts.rojo) {
					continue;
				}

				assert(reference.data.projectReferencePaths);
				const paths = new Set(reference.data.projectReferencePaths.values());
				for (const fileName of reference.config.fileNames) {
					if (
						ts.isDeclarationFileName(fileName) &&
						!isPathDescendantOf(fileName, reference.pathTranslator.rootDir)
					) {
						continue;
					}
					paths.add(reference.pathTranslator.getImportPath(fileName));
				}
				paths.add(path.join(reference.data.projectOptions.includePath, "RuntimeLib.lua"));

				for (const filePath of paths) {
					const ownerPath = owner.getRbxPathFromFilePath(filePath);
					const consumerPath = consumer?.getRbxPathFromFilePath(filePath);
					if (JSON.stringify(ownerPath) !== JSON.stringify(consumerPath)) {
						throw new DiagnosticError([
							createTextDiagnostic(
								`Project "${project.data.tsConfigPath}" must mount "${filePath}" at the same Roblox path as "${reference.data.rojoConfigPath}" (${ownerPath?.join(".") ?? "unmapped"}). Referenced projects with their own rbxts.rojo require consistent module and runtime mounts.`,
							),
						]);
					}
				}
			}
		}
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
