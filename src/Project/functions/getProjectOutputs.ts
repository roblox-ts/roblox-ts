import fs from "fs-extra";
import path from "path";
import { ProjectGraph, ProjectNode, projectPathKey } from "Project/classes/ProjectGraph";
import { checkFileName } from "Project/functions/checkFileName";
import { INCLUDE_PATH } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { getRootDirs } from "Shared/util/getRootDirs";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import ts from "typescript";

export interface ProjectOutputs {
	roots: Array<string>;
	files: Map<string, string | undefined>;
	assets: Map<string, string>;
}

export function getOutputRoots(project: ProjectNode) {
	const roots = new Set<string>();
	if (project.pathTranslator) {
		roots.add(project.pathTranslator.outDir);
		if (ts.getEmitDeclarations(project.config.options) && project.config.options.declarationDir) {
			roots.add(path.normalize(project.config.options.declarationDir));
		}
	}

	return [...roots];
}

export function validateProjectOutputs(graph: ProjectGraph) {
	const owners = new Map<string, ProjectNode>();
	const buildInfoOwners = new Map<string, ProjectNode>();
	const sources = [...graph.projects.values()].flatMap(project =>
		project.pathTranslator ? getRootDirs(project.config.options) : [],
	);

	for (const project of graph.projects.values()) {
		for (const root of getOutputRoots(project)) {
			for (const source of sources) {
				if (isPathDescendantOf(source, root)) {
					throw new ProjectError(`Output directory "${root}" contains source directory "${source}".`);
				}
			}

			for (const [otherRoot, owner] of owners) {
				if (owner !== project && (isPathDescendantOf(root, otherRoot) || isPathDescendantOf(otherRoot, root))) {
					throw new ProjectError(
						`Projects "${owner.data.tsConfigPath}" and "${project.data.tsConfigPath}" have overlapping output directories. Use separate outDir and declarationDir paths.`,
					);
				}
			}

			owners.set(root, project);
		}

		for (const buildInfoPath of [project.pathTranslator?.buildInfoOutputPath, project.tsBuildInfoPath]) {
			if (!buildInfoPath) {
				continue;
			}
			const key = projectPathKey(buildInfoPath);
			if (buildInfoOwners.has(key)) {
				throw new ProjectError(
					`Multiple projects write "${buildInfoPath}". Set a unique tsBuildInfoFile for each project.`,
				);
			}

			buildInfoOwners.set(key, project);
		}
	}

	for (const [buildInfoPath, project] of buildInfoOwners) {
		for (const [root, owner] of owners) {
			if (owner !== project && isPathDescendantOf(buildInfoPath, projectPathKey(root))) {
				throw new ProjectError(
					`Build info "${buildInfoPath}" is inside another project's output directory "${root}".`,
				);
			}
		}
	}
}

export function getProjectOutputs(project: ProjectNode, graph: ProjectGraph): ProjectOutputs {
	const roots = getOutputRoots(project);
	const files = new Map<string, string | undefined>();
	const assets = new Map<string, string>();

	const translator = project.pathTranslator;
	assert(translator);

	const addOutput = (output: string, input: string) => {
		const key = projectPathKey(output);
		const previous = files.get(key);
		if (previous !== undefined && previous !== input) {
			throw new ProjectError(`Files "${previous}" and "${input}" both emit to "${output}".`);
		}

		files.set(key, input);
	};

	for (const fileName of project.config.fileNames) {
		if (ts.isDeclarationFileName(fileName) || fileName.endsWith(".json")) {
			continue;
		}

		addOutput(translator.getOutputPath(fileName), fileName);
		if (project.data.projectOptions.writeTransformedFiles && project.config.options.plugins?.length) {
			addOutput(translator.getOutputTransformedPath(fileName), fileName);
		}

		for (const output of ts.getOutputFileNames(project.config, fileName, !ts.sys.useCaseSensitiveFileNames)) {
			if (output.endsWith(".d.ts") || output.endsWith(".d.ts.map")) {
				addOutput(output, fileName);
			}
		}
	}

	const excluded = [...graph.projects.values()].flatMap(getOutputRoots);
	excluded.push(graph.root.data.projectOptions.includePath);

	const buildInfoPaths = new Set(
		[...graph.projects.values()]
			.flatMap(node => [node.pathTranslator?.buildInfoOutputPath, node.tsBuildInfoPath])
			.filter((filePath): filePath is string => filePath !== undefined)
			.map(projectPathKey),
	);

	const walk = (input: string) => {
		if (excluded.some(root => isPathDescendantOf(input, root)) || !fs.existsSync(input)) {
			return;
		}

		if (fs.statSync(input).isDirectory()) {
			if (path.basename(input) === "node_modules" || path.basename(input) === ".git") {
				return;
			}

			for (const name of fs.readdirSync(input)) {
				walk(path.join(input, name));
			}
		} else {
			if (graph.configPaths.has(input) || buildInfoPaths.has(projectPathKey(input))) {
				return;
			}
			if (input.endsWith(".ts") || input.endsWith(".tsx")) {
				if (!ts.isDeclarationFileName(input) || !translator.declaration) {
					return;
				}
			}

			checkFileName(input);

			const output = translator.getOutputPath(input);
			addOutput(output, input);
			assets.set(projectPathKey(output), input);
		}
	};

	for (const root of getRootDirs(project.config.options)) {
		walk(root);
	}

	// the shared runtime can be placed inside an output directory, including at its root
	const preserveInclude = (directory: string) => {
		for (const name of fs.readdirSync(directory)) {
			const input = path.join(directory, name);

			if (fs.statSync(input).isDirectory()) {
				preserveInclude(input);
			} else {
				addOutput(
					path.join(graph.root.data.projectOptions.includePath, path.relative(INCLUDE_PATH, input)),
					input,
				);
			}
		}
	};

	preserveInclude(INCLUDE_PATH);

	if (translator.buildInfoOutputPath) {
		files.set(projectPathKey(translator.buildInfoOutputPath), undefined);
	}
	if (project.tsBuildInfoPath) {
		files.set(projectPathKey(project.tsBuildInfoPath), undefined);
	}
	for (const node of graph.projects.values()) {
		for (const configPath of node.data.rojoConfigFiles?.keys() ?? []) {
			if (!files.has(projectPathKey(configPath))) {
				files.set(projectPathKey(configPath), undefined);
			}
		}
	}

	return { roots, files, assets };
}

export function syncProjectOutputs(outputs: ProjectOutputs, writeOnlyChanged: boolean) {
	for (const [output, input] of outputs.assets) {
		if (writeOnlyChanged && fs.existsSync(output) && fs.readFileSync(output).equals(fs.readFileSync(input))) {
			continue;
		}

		fs.copySync(input, output);
	}

	const clean = (directory: string) => {
		if (!fs.existsSync(directory)) {
			return;
		}

		for (const name of fs.readdirSync(directory)) {
			if (name === ".git") {
				continue;
			}

			const output = path.join(directory, name);
			if (fs.lstatSync(output).isDirectory()) {
				clean(output);
				if (fs.readdirSync(output).length === 0) {
					fs.rmdirSync(output);
				}
			} else if (!outputs.files.has(projectPathKey(output))) {
				fs.removeSync(output);
			}
		}
	};

	for (const root of outputs.roots) {
		clean(root);
	}
}
