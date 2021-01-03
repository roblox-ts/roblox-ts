import ts from "byots";
import chokidar from "chokidar";
import fs from "fs-extra";
import path from "path";
import { ProjectData } from "Project";
import { cleanup } from "Project/functions/cleanup";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { copyItem } from "Project/functions/copyItem";
import { createNodeModulesPathMapping } from "Project/functions/createNodeModulesPathMapping";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProgramFactory } from "Project/functions/createProgramFactory";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { tryRemoveOutput } from "Project/functions/tryRemoveOutput";
import { hasErrors } from "Project/util/hasErrors";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { walkDirectorySync } from "Project/util/walkDirectorySync";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { assert } from "Shared/util/assert";
import { getRootDirs } from "Shared/util/getRootDirs";

const CHOKIDAR_OPTIONS: chokidar.WatchOptions = {
	awaitWriteFinish: {
		pollInterval: 10,
		stabilityThreshold: 50,
	},
	ignoreInitial: true,
	disableGlobbing: true,
};

function fixSlashes(fsPath: string) {
	return fsPath.replace(/\\/g, "/");
}

export function setupProjectWatchProgram(data: ProjectData, usePolling: boolean) {
	const { fileNames, options } = getParsedCommandLine(data);
	const fileNamesSet = new Set(fileNames);

	let initialCompileCompleted = false;
	let collecting = false;
	let filesToAdd = new Set<string>();
	let filesToChange = new Set<string>();
	let filesToDelete = new Set<string>();

	const watchReporter = ts.createWatchStatusReporter(ts.sys, true);
	const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);

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
			options,
		);
	}

	function reportEmitResult(emitResult: ts.EmitResult) {
		for (const diagnostic of emitResult.diagnostics) {
			diagnosticReporter(diagnostic);
		}
		const amtErrors = emitResult.diagnostics.filter(v => v.category === ts.DiagnosticCategory.Error).length;
		reportText(`Found ${amtErrors} error${amtErrors === 1 ? "" : "s"}. Watching for file changes.`);
	}

	let program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
	let pathTranslator: PathTranslator | undefined;
	const createProgram = createProgramFactory(data, options);
	function refreshProgram() {
		try {
			program = createProgram([...fileNamesSet], options);
			pathTranslator = createPathTranslator(program);
		} catch (e) {
			if (e instanceof DiagnosticError) {
				for (const diagnostic of e.diagnostics) {
					diagnosticReporter(diagnostic);
				}
			} else {
				throw e;
			}
		}
	}

	function runInitialCompile() {
		refreshProgram();
		assert(program && pathTranslator);
		cleanup(pathTranslator);
		copyInclude(data);
		copyFiles(data, pathTranslator, new Set(getRootDirs(options)));
		const sourceFiles = getChangedSourceFiles(program);
		const emitResult = compileFiles(program.getProgram(), data, pathTranslator, sourceFiles);
		if (!hasErrors(emitResult.diagnostics)) {
			initialCompileCompleted = true;
		}
		return emitResult;
	}

	function runIncrementalCompile(additions: Set<string>, changes: Set<string>, removals: Set<string>): ts.EmitResult {
		const filesToCompile = new Set<string>();
		const filesToCopy = new Set<string>();
		const filesToClean = new Set<string>();

		for (const fsPath of additions) {
			if (isCompilableFile(fsPath)) {
				fileNamesSet.add(fsPath);
				filesToCompile.add(fsPath);
			} else {
				filesToCopy.add(fsPath);
			}
			if (fs.statSync(fsPath).isDirectory()) {
				walkDirectorySync(fsPath, item => {
					if (isCompilableFile(item)) {
						filesToCompile.add(item);
					}
				});
			}
		}

		for (const fsPath of changes) {
			if (isCompilableFile(fsPath)) {
				filesToCompile.add(fsPath);
			} else {
				filesToCopy.add(fsPath);
			}
		}

		for (const fsPath of removals) {
			fileNamesSet.delete(fsPath);
			filesToClean.add(fsPath);
		}

		refreshProgram();
		assert(program && pathTranslator);
		for (const fsPath of filesToClean) {
			tryRemoveOutput(pathTranslator, pathTranslator.getOutputPath(fsPath));
		}
		for (const fsPath of filesToCopy) {
			copyItem(data, pathTranslator, fsPath);
		}
		const sourceFiles = getChangedSourceFiles(program, options.incremental ? undefined : [...filesToCompile]);
		const emitResult = compileFiles(program.getProgram(), data, pathTranslator, sourceFiles);
		return emitResult;
	}

	function closeEventCollection() {
		collecting = false;
		const additions = filesToAdd;
		const changes = filesToChange;
		const removals = filesToDelete;
		filesToAdd = new Set();
		filesToChange = new Set();
		filesToDelete = new Set();

		const emitResult = !initialCompileCompleted
			? runInitialCompile()
			: runIncrementalCompile(additions, changes, removals);
		reportEmitResult(emitResult);
	}

	function openEventCollection() {
		if (!collecting) {
			collecting = true;
			reportText("File change detected. Starting incremental compilation...");
			setTimeout(closeEventCollection, 100);
		}
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

	const chokidarOptions: chokidar.WatchOptions = { ...CHOKIDAR_OPTIONS, usePolling };

	chokidar
		.watch(getRootDirs(options), chokidarOptions)
		.on("add", collectAddEvent)
		.on("addDir", collectAddEvent)
		.on("change", collectChangeEvent)
		.on("unlink", collectDeleteEvent)
		.on("unlinkDir", collectDeleteEvent);

	function recreateNodeModulesPathMapping() {
		data.nodeModulesPathMapping = createNodeModulesPathMapping(data.nodeModulesPath);
	}

	chokidar
		.watch(path.join(data.projectPath, "package-lock.json"), chokidarOptions)
		.on("all", recreateNodeModulesPathMapping);

	reportText("Starting compilation in watch mode...");
	reportEmitResult(runInitialCompile());
}
