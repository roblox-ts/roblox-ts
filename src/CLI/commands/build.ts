import { PathTranslator } from "@roblox-ts/path-translator";
import assert from "assert";
import chokidar, { ChokidarOptions } from "chokidar";
import { CLIError } from "CLI/errors/CLIError";
import fs from "fs-extra";
import path from "path";
import { checkFileName } from "Project/functions/checkFileName";
import { cleanup } from "Project/functions/cleanup";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { copyItem } from "Project/functions/copyItem";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProgramFactory } from "Project/functions/createProgramFactory";
import { createProjectData } from "Project/functions/createProjectData";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { tryRemoveOutput } from "Project/functions/tryRemoveOutput";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { walkDirectorySync } from "Project/util/walkDirectorySync";
import { LogService } from "Shared/classes/LogService";
import { DEFAULT_PROJECT_OPTIONS, DTS_EXT, ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { LoggableError } from "Shared/errors/LoggableError";
import { ProjectData, ProjectOptions } from "Shared/types";
import { getRootDirs } from "Shared/util/getRootDirs";
import { hasErrors } from "Shared/util/hasErrors";
import ts from "typescript";
import type yargs from "yargs";

function getTsConfigProjectOptions(tsConfigPath?: string): Partial<ProjectOptions> | undefined {
	if (tsConfigPath !== undefined) {
		const rawJson = ts.sys.readFile(tsConfigPath);
		if (rawJson !== undefined) {
			return ts.parseConfigFileTextToJson(tsConfigPath, rawJson).config.rbxts;
		}
	}
}

function findTsConfigPath(projectPath: string) {
	let tsConfigPath: string | undefined = path.resolve(projectPath);
	if (!fs.existsSync(tsConfigPath) || !fs.statSync(tsConfigPath).isFile()) {
		tsConfigPath = ts.findConfigFile(tsConfigPath, ts.sys.fileExists);
		if (tsConfigPath === undefined) {
			throw new CLIError("Unable to find tsconfig.json!");
		}
	}
	return path.resolve(process.cwd(), tsConfigPath);
}

interface BuildFlags {
	project: string;
}

/**
 * Defines the behavior for the `rbxtsc build` command.
 */
export = ts.identity<yargs.CommandModule<object, BuildFlags & Partial<ProjectOptions>>>({
	command: ["$0", "build"],

	describe: "Build a project",

	builder: (parser: yargs.Argv) =>
		parser
			.option("project", {
				alias: "p",
				string: true,
				default: ".",
				describe: "project path",
			})
			// DO NOT PROVIDE DEFAULTS BELOW HERE, USE DEFAULT_PROJECT_OPTIONS
			.option("watch", {
				alias: "w",
				boolean: true,
				describe: "enable watch mode",
			})
			.option("usePolling", {
				implies: "watch",
				boolean: true,
				describe: "use polling for watch mode",
			})
			.option("verbose", {
				boolean: true,
				describe: "enable verbose logs",
			})
			.option("noInclude", {
				boolean: true,
				describe: "do not copy include files",
			})
			.option("logTruthyChanges", {
				boolean: true,
				describe: "logs changes to truthiness evaluation from Lua truthiness rules",
			})
			.option("writeOnlyChanged", {
				boolean: true,
				hidden: true,
			})
			.option("writeTransformedFiles", {
				boolean: true,
				hidden: true,
				describe: "writes resulting TypeScript ASTs after transformers to out directory",
			})
			.option("optimizedLoops", {
				boolean: true,
				hidden: true,
			})
			.option("type", {
				choices: [ProjectType.Game, ProjectType.Model, ProjectType.Package] as const,
				describe: "override project type",
			})
			.option("includePath", {
				alias: "i",
				string: true,
				describe: "folder to copy runtime files to",
			})
			.option("rojo", {
				string: true,
				describe: "manually select Rojo project file",
			})
			.option("allowCommentDirectives", {
				boolean: true,
				hidden: true,
			})
			.option("luau", {
				boolean: true,
				describe: "emit files with .luau extension",
			}),

	handler: async argv => {
		try {
			let rootData: ProjectData;
			{
				const tsConfigPath = findTsConfigPath(argv.project);
				// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
				const projectOptions = Object.assign(
					{},
					DEFAULT_PROJECT_OPTIONS,
					getTsConfigProjectOptions(tsConfigPath),
					argv,
				);
				rootData = createProjectData(tsConfigPath, projectOptions);
			}

			LogService.verbose = rootData.projectOptions.verbose === true;

			const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);

			interface ProjectBuildState {
				data: ProjectData;
				fileNamesSet: Set<string>;
				compilerOptions: ts.CompilerOptions;
				createProgram: ts.CreateProgram<ts.EmitAndSemanticDiagnosticsBuilderProgram>;
				rootDirs: Array<string>;
				isRoot: boolean;
				pathTranslator: PathTranslator;
			}

			const projectStates = new Map<string, ProjectBuildState>();

			function createProjectState(data: ProjectData, isRoot: boolean): ProjectBuildState {
				const { fileNames, options, projectReferences } = getParsedCommandLine(data);
				return {
					data,
					fileNamesSet: new Set(fileNames),
					compilerOptions: options,
					createProgram: createProgramFactory(data, options, projectReferences),
					rootDirs: getRootDirs(options),
					isRoot,
					pathTranslator: createPathTranslator(options, data),
				};
			}

			for (const refProject of rootData.referencedProjects) {
				const options: ProjectOptions = {
					...rootData.projectOptions,
					noInclude: true,
					includePath: rootData.projectOptions.includePath,
					rojo: rootData.rojoConfigPath,
				};

				const data = createProjectData(refProject.tsConfigPath, options);
				projectStates.set(data.tsConfigPath, createProjectState(data, false));
			}

			const rootState = createProjectState(rootData, true);
			projectStates.set(rootData.tsConfigPath, rootState);

			function getProjectPathTranslator(tsConfigPath: string) {
				const project = projectStates.get(tsConfigPath);
				assert(project);
				return project.pathTranslator;
			}

			function buildProject(
				state: ProjectBuildState,
				changedFiles: Array<string> | undefined,
				copyAllFiles: boolean,
			): { result: ts.EmitResult; pathTranslator: PathTranslator } {
				const relPath = path.relative(path.dirname(rootData.projectPath), state.data.projectPath);
				LogService.writeLineIfVerbose(`Building project: ${relPath}`);

				const program = state.createProgram([...state.fileNamesSet], state.compilerOptions);

				if (copyAllFiles) {
					copyFiles(state.data, state.pathTranslator, new Set(state.rootDirs));
				}

				const sourceFiles = getChangedSourceFiles(
					program,
					state.compilerOptions.incremental ? undefined : changedFiles,
				);

				const result = compileFiles(
					program.getProgram(),
					state.data,
					state.pathTranslator,
					getProjectPathTranslator,
					sourceFiles,
				);
				return { result, pathTranslator: state.pathTranslator };
			}

			function buildAllProjects(): { diagnostics: Array<ts.Diagnostic>; emitSkipped: boolean } {
				cleanup(rootState.pathTranslator);
				copyInclude(rootState.data);

				const allDiagnostics: Array<ts.Diagnostic> = [];
				let depEmitSkipped = false;

				for (const refProject of rootData.referencedProjects) {
					const state = projectStates.get(refProject.tsConfigPath);
					assert(state);

					const { result } = buildProject(state, undefined, true);
					allDiagnostics.push(...result.diagnostics);

					if (result.emitSkipped) {
						depEmitSkipped = true;
						break;
					}

					if (hasErrors(result.diagnostics)) {
						break;
					}
				}

				const { result: rootResult } = buildProject(rootState, undefined, true);
				allDiagnostics.push(...rootResult.diagnostics);

				return { diagnostics: allDiagnostics, emitSkipped: depEmitSkipped || rootResult.emitSkipped };
			}

			if (rootData.projectOptions.watch) {
				const CHOKIDAR_OPTIONS: ChokidarOptions = {
					awaitWriteFinish: {
						pollInterval: 10,
						stabilityThreshold: 50,
					},
					ignoreInitial: true,
				};

				function fixSlashes(fsPath: string) {
					return fsPath.replace(/\\/g, "/");
				}

				let filesToAdd = new Set<string>();
				let filesToChange = new Set<string>();
				let filesToDelete = new Set<string>();

				const watchReporter = ts.createWatchStatusReporter(ts.sys, true);

				function reportText(messageText: string) {
					watchReporter(
						{
							category: ts.DiagnosticCategory.Message,
							messageText,
							code: 0,
							file: undefined,
							length: undefined,
							start: undefined,
						},
						ts.sys.newLine,
						rootState.compilerOptions,
					);
				}

				function reportEmitResult(diagnostics: ReadonlyArray<ts.Diagnostic>) {
					for (const diagnostic of diagnostics) {
						diagnosticReporter(diagnostic);
					}
					const amtErrors = diagnostics.filter(v => v.category === ts.DiagnosticCategory.Error).length;
					reportText(`Found ${amtErrors} error${amtErrors === 1 ? "" : "s"}. Watching for file changes.`);
				}

				function findProjectForFile(filePath: string): ProjectBuildState | undefined {
					const normalizedPath = path.normalize(filePath);
					for (const state of projectStates.values()) {
						for (const rootDir of state.rootDirs) {
							if (normalizedPath.startsWith(path.normalize(rootDir) + path.sep)) {
								return state;
							}
						}
					}
					return undefined;
				}

				function runIncrementalCompile(
					additions: Set<string>,
					changes: Set<string>,
					removals: Set<string>,
				): Array<ts.Diagnostic> {
					type FileBuckets = {
						toCompile: Set<string>;
						toCopy: Set<string>;
						toClean: Set<string>;
					};

					const bucketsByProject = new Map<ProjectBuildState, FileBuckets>();
					const affectedProjects = new Set<ProjectBuildState>();

					function getProjectBuckets(state: ProjectBuildState): FileBuckets {
						let b = bucketsByProject.get(state);
						if (!b) {
							b = { toCompile: new Set(), toCopy: new Set(), toClean: new Set() };
							bucketsByProject.set(state, b);
						}
						return b;
					}

					for (const fsPath of additions) {
						const state = findProjectForFile(fsPath);
						if (!state) {
							continue;
						}

						affectedProjects.add(state);
						const bucket = getProjectBuckets(state);

						if (fs.statSync(fsPath).isDirectory()) {
							walkDirectorySync(fsPath, item => {
								if (isCompilableFile(item)) {
									state.fileNamesSet.add(item);
									bucket.toCompile.add(item);
								}
							});
						} else if (isCompilableFile(fsPath)) {
							state.fileNamesSet.add(fsPath);
							bucket.toCompile.add(fsPath);
						} else {
							// checks for copying `init.*.d.ts`
							checkFileName(fsPath);
							bucket.toCopy.add(fsPath);
						}
					}

					for (const fsPath of changes) {
						const state = findProjectForFile(fsPath);
						if (!state) {
							continue;
						}

						affectedProjects.add(state);
						const bucket = getProjectBuckets(state);

						if (isCompilableFile(fsPath)) {
							bucket.toCompile.add(fsPath);
						} else {
							// Transformers use a separate program that must be updated separately (which is done in compileFiles),
							// however certain files (such as d.ts files) aren't passed to that function and must be updated here.
							if (fsPath.endsWith(DTS_EXT)) {
								const transformerWatcher = state.data.transformerWatcher;
								if (transformerWatcher) {
									// Using ts.sys.readFile instead of fs.readFileSync here as it performs some utf conversions implicitly
									// and is also used by the program host to read files.
									const contents = ts.sys.readFile(fsPath);
									if (contents) {
										transformerWatcher.updateFile(fsPath, contents);
									}
								}
							}
							bucket.toCopy.add(fsPath);
						}
					}

					for (const fsPath of removals) {
						const state = findProjectForFile(fsPath);
						if (!state) {
							continue;
						}

						affectedProjects.add(state);
						const bucket = getProjectBuckets(state);

						state.fileNamesSet.delete(fsPath);
						bucket.toClean.add(fsPath);
					}

					let dependencyAffected = false;
					for (const refProject of rootData.referencedProjects) {
						const state = projectStates.get(refProject.tsConfigPath);
						assert(state);

						if (affectedProjects.has(state)) {
							dependencyAffected = true;
						} else if (dependencyAffected) {
							affectedProjects.add(state);
						}
					}

					if (dependencyAffected) {
						affectedProjects.add(rootState);
					}

					const allDiagnostics: Array<ts.Diagnostic> = [];

					for (const tsConfigPath of [
						...rootData.referencedProjects.map(p => p.tsConfigPath),
						rootState.data.tsConfigPath,
					]) {
						const state = projectStates.get(tsConfigPath);
						assert(state);

						if (!affectedProjects.has(state)) {
							continue;
						}

						const { toCompile, toClean, toCopy } = getProjectBuckets(state);

						const { result, pathTranslator } = buildProject(
							state,
							toCompile.size > 0 ? [...toCompile] : undefined,
							false,
						);
						allDiagnostics.push(...result.diagnostics);

						if (result.emitSkipped) {
							break;
						} else {
							for (const fsPath of toClean) {
								tryRemoveOutput(pathTranslator, pathTranslator.getOutputPath(fsPath));
								if (state.compilerOptions.declaration) {
									tryRemoveOutput(pathTranslator, pathTranslator.getOutputDeclarationPath(fsPath));
								}
							}

							for (const fsPath of toCopy) {
								copyItem(state.data, pathTranslator, fsPath);
							}
						}
					}

					return allDiagnostics;
				}

				let initialCompileCompleted = false;

				function runCompile(): Array<ts.Diagnostic> {
					try {
						if (!initialCompileCompleted) {
							const result = buildAllProjects();
							if (!result.emitSkipped) {
								initialCompileCompleted = true;
							}

							return result.diagnostics;
						} else {
							const additions = filesToAdd;
							const changes = filesToChange;
							const removals = filesToDelete;
							filesToAdd = new Set();
							filesToChange = new Set();
							filesToDelete = new Set();
							return runIncrementalCompile(additions, changes, removals);
						}
					} catch (e) {
						if (e instanceof DiagnosticError) {
							return [...e.diagnostics];
						} else {
							throw e;
						}
					}
				}

				let collecting = false;
				let collectionTimeout: NodeJS.Timeout | undefined;

				function closeEventCollection() {
					collecting = false;
					collectionTimeout = undefined;
					reportEmitResult(runCompile());
				}

				function openEventCollection() {
					if (!collecting) {
						collecting = true;
						reportText("File change detected. Starting incremental compilation...");
					}
					if (collectionTimeout) {
						clearTimeout(collectionTimeout);
					}
					collectionTimeout = setTimeout(closeEventCollection, 100);
				}

				function collectAddEvent(fsPath: string) {
					filesToAdd.add(fixSlashes(fsPath));
					openEventCollection();
				}

				function collectChangeEvent(fsPath: string) {
					filesToChange.add(fixSlashes(fsPath));
					openEventCollection();
				}

				function collectDeleteEvent(fsPath: string) {
					filesToDelete.add(fixSlashes(fsPath));
					openEventCollection();
				}

				const allRootDirs: Array<string> = [];
				for (const state of projectStates.values()) {
					allRootDirs.push(...state.rootDirs);
				}

				const chokidarOptions: ChokidarOptions = {
					...CHOKIDAR_OPTIONS,
					usePolling: rootData.projectOptions.usePolling,
				};

				chokidar
					.watch(allRootDirs, chokidarOptions)
					.on("add", collectAddEvent)
					.on("addDir", collectAddEvent)
					.on("change", collectChangeEvent)
					.on("unlink", collectDeleteEvent)
					.on("unlinkDir", collectDeleteEvent)
					.once("ready", () => {
						reportText("Starting compilation in watch mode...");
						reportEmitResult(runCompile());
					});
			} else {
				const allDiagnostics = buildAllProjects().diagnostics;

				for (const diagnostic of allDiagnostics) {
					diagnosticReporter(diagnostic);
				}

				if (hasErrors(allDiagnostics)) {
					process.exitCode = 1;
				}
			}
		} catch (e) {
			process.exitCode = 1;
			if (e instanceof LoggableError) {
				e.log();
				debugger;
			} else {
				throw e;
			}
		}
	},
});
