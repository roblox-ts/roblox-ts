import fs from "fs-extra";
import path from "path";
import { ProjectGraph, ProjectNode, projectPathKey } from "Project/classes/ProjectGraph";
import { compileFiles } from "Project/functions/compileFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { createProgramFactory } from "Project/functions/createProgramFactory";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import {
	getOutputRoots,
	getProjectOutputs,
	syncProjectOutputs,
	validateProjectOutputs,
} from "Project/functions/getProjectOutputs";
import { LogService } from "Shared/classes/LogService";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectOptions } from "Shared/types";
import { getRootDirs } from "Shared/util/getRootDirs";
import { hasErrors } from "Shared/util/hasErrors";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import ts from "typescript";

interface ProjectBuildState {
	project: ProjectNode;
	signature: string;
	inputs: Set<string>;
	diagnostics: ReadonlyArray<ts.Diagnostic>;
	dirty: boolean;
	blocked: boolean;
}

export class ProjectBuild {
	public graph: ProjectGraph;

	private states = new Map<string, ProjectBuildState>();
	private configPaths = new Set<string>();

	constructor(
		private readonly tsConfigPath: string,
		private readonly overrides: Partial<ProjectOptions> = {},
	) {
		this.tsConfigPath = path.resolve(tsConfigPath);
		this.graph = new ProjectGraph(this.tsConfigPath, overrides, this.configPaths);

		this.refresh(this.graph);
	}

	private refresh(graph?: ProjectGraph) {
		if (!graph) {
			const configPaths = new Set<string>();
			try {
				graph = new ProjectGraph(this.tsConfigPath, this.overrides, configPaths);
			} finally {
				// failed config locations must stay watched so creating or repairing them can recover the graph
				for (const configPath of configPaths) {
					this.configPaths.add(configPath);
				}
			}
		}

		validateProjectOutputs(graph);

		const states = new Map<string, ProjectBuildState>();
		for (const [key, project] of graph.projects) {
			const signature = JSON.stringify({
				options: { ...project.config.options, configFile: undefined },
				files: project.config.fileNames,
				references: project.dependencies,
				projectOptions: project.data.projectOptions,
				paths: Array.from(project.data.projectReferencePaths ?? []),
			});

			const previous = this.states.get(key);
			if (previous?.signature === signature) {
				project.data.transformerWatcher = previous.project.data.transformerWatcher;
				states.set(key, { ...previous, project });
			} else {
				previous?.project.data.transformerWatcher?.service.dispose();

				states.set(key, {
					project,
					signature,
					inputs: new Set(),
					diagnostics: [],
					dirty: true,
					blocked: false,
				});
			}
		}

		for (const [key, state] of this.states) {
			if (!states.has(key)) {
				state.project.data.transformerWatcher?.service.dispose();
			}
		}

		this.graph = graph;
		this.states = states;
		this.configPaths = graph.configPaths;
	}

	public getWatchPaths() {
		const paths = new Set(this.configPaths);

		for (const state of this.states.values()) {
			if (state.project.pathTranslator) {
				for (const root of getRootDirs(state.project.config.options)) {
					paths.add(root);
				}
			}

			if (state.project.data.rojoConfigPath) {
				paths.add(state.project.data.rojoConfigPath);
			}

			for (const input of state.inputs) {
				if (!this.isOutputPath(input)) {
					paths.add(input);
				}
			}
		}

		return [...paths];
	}

	public isOutputPath(filePath: string) {
		const key = projectPathKey(filePath);
		if (isPathDescendantOf(key, projectPathKey(this.graph.root.data.projectOptions.includePath))) {
			return true;
		}

		for (const project of this.graph.projects.values()) {
			if (
				project.pathTranslator?.buildInfoOutputPath &&
				key === projectPathKey(project.pathTranslator.buildInfoOutputPath)
			) {
				return true;
			}

			if (getOutputRoots(project).some(root => isPathDescendantOf(key, projectPathKey(root)))) {
				return true;
			}
		}

		return false;
	}

	public build(changedFiles?: ReadonlyArray<string>, referencesOnly = false): ts.EmitResult {
		this.refresh();

		const configChanged = changedFiles?.some(file =>
			[...this.graph.configPaths, this.graph.root.data.rojoConfigPath].some(
				config => config && projectPathKey(config) === projectPathKey(file),
			),
		);

		for (const state of this.states.values()) {
			const roots = state.project.pathTranslator ? getRootDirs(state.project.config.options) : [];
			if (
				!changedFiles ||
				configChanged ||
				changedFiles.some(
					file =>
						state.inputs.has(projectPathKey(file)) || roots.some(root => isPathDescendantOf(file, root)),
				)
			) {
				state.dirty = true;
			}
		}

		// the graph is in dependency order, so dirty prerequisites propagate before their consumers are visited
		for (const state of this.states.values()) {
			if (state.project.dependencies.some(key => this.states.get(key)?.dirty)) {
				state.dirty = true;
			}
		}

		const emittedFiles = new Array<string>();
		copyInclude(this.graph.root.data);

		for (const state of this.states.values()) {
			if (referencesOnly && state.project === this.graph.root) {
				continue;
			}

			state.blocked = state.project.dependencies.some(key => {
				const dependency = this.states.get(key);
				return dependency?.blocked || (dependency && hasErrors(dependency.diagnostics));
			});
			if (state.blocked || !state.dirty) {
				continue;
			}

			try {
				const result = this.buildProject(state);
				state.diagnostics = result.diagnostics;
				if (!result.emitSkipped) {
					state.dirty = false;
				}

				emittedFiles.push(...(result.emittedFiles ?? []));
			} catch (error) {
				if (!(error instanceof DiagnosticError)) {
					throw error;
				}

				state.diagnostics = error.diagnostics;
			}
		}

		const diagnostics = [...this.states.values()].flatMap(state => [...state.diagnostics]);

		return {
			emitSkipped: hasErrors(diagnostics),
			diagnostics: ts.sortAndDeduplicateDiagnostics(diagnostics),
			emittedFiles,
		};
	}

	private buildProject(state: ProjectBuildState): ts.EmitResult {
		const { data, config, pathTranslator } = state.project;
		if (!pathTranslator) {
			return { emitSkipped: false, diagnostics: [] };
		}

		LogService.writeLineIfVerbose(`Building project: ${data.tsConfigPath}`);

		const outputs = getProjectOutputs(state.project, this.graph);
		const createProgram = createProgramFactory(data, config.options, config.projectReferences);
		const builder = createProgram(config.fileNames, config.options);
		const program = builder.getProgram();

		state.inputs = new Set(program.getSourceFiles().map(file => projectPathKey(file.fileName)));

		const sourceFiles = new Set(getChangedSourceFiles(builder));
		for (const [output, input] of outputs.files) {
			if (input && !outputs.assets.has(output) && !fs.existsSync(output)) {
				const source = program.getSourceFile(input);
				if (source && !source.isDeclarationFile && !ts.isJsonSourceFile(source)) {
					sourceFiles.add(source);
				}
			}
		}

		// compileFiles checks the rebound plugin output, which can differ from the original TypeScript
		const result = compileFiles(program, data, pathTranslator, [...sourceFiles]);
		if (!result.emitSkipped) {
			syncProjectOutputs(outputs, data.projectOptions.writeOnlyChanged);
		}

		return result;
	}

	public close() {
		for (const state of this.states.values()) {
			state.project.data.transformerWatcher?.service.dispose();
		}
	}
}
