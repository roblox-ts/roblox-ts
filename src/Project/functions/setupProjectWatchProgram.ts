import ts from "byots";
import chokidar from "chokidar";
import { compileAll, createProjectServices, ProjectData } from "Project";
import { tryRemove } from "Project/functions/cleanup";
import { compileFiles } from "Project/functions/compileFiles";
import { copyItem } from "Project/functions/copyFiles";
import { createProgramFactory } from "Project/functions/createProgramFactory";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { getRootDirs } from "Project/functions/getRootDirs";
import { ProjectServices } from "Project/types";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { assert } from "Shared/util/assert";

function isCompilableFile(fsPath: string) {
	return fsPath.endsWith(ts.Extension.Ts) || fsPath.endsWith(ts.Extension.Tsx);
}

export function setupProjectWatchProgram(data: ProjectData, usePolling: boolean) {
	// eslint-disable-next-line prefer-const
	let { fileNames, options } = getParsedCommandLine(data);

	let initialCompileCompleted = false;

	let program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
	let services: ProjectServices | undefined;
	const createProgram = createProgramFactory(data, options);
	function refreshProgram() {
		try {
			program = createProgram(fileNames, options);
			services = createProjectServices(program, data);
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
	refreshProgram();

	const watchReporter = ts.createWatchStatusReporter(ts.sys, true);
	const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);

	function reportText(text: string) {
		watchReporter(
			{
				category: ts.DiagnosticCategory.Message,
				messageText: text,
				code: 1234,
				file: undefined,
				length: undefined,
				start: undefined,
			},
			ts.sys.newLine,
			options,
		);
	}

	function compileWithEmitResult(fsPath?: string): ts.EmitResult {
		assert(program && services);
		if (!initialCompileCompleted) {
			const emitResult = compileAll(program, data, services);
			if (emitResult.diagnostics.length === 0) {
				initialCompileCompleted = true;
			}
			return emitResult;
		} else if (fsPath !== undefined) {
			if (isCompilableFile(fsPath)) {
				const sourceFiles = getChangedSourceFiles(program, options.incremental ? undefined : fsPath);
				const emitResult = compileFiles(program, data, services, sourceFiles);
				if (emitResult.diagnostics.length === 0) {
					program.getProgram().emitBuildInfo();
				}
				return emitResult;
			} else {
				copyItem(services, fsPath);
			}
		}
		return { emitSkipped: false, diagnostics: [] };
	}

	function compile(fsPath?: string) {
		reportText("File change detected. Starting incremental compilation...");
		refreshProgram();
		const emitResult = compileWithEmitResult(fsPath);
		for (const diagnostic of emitResult.diagnostics) {
			diagnosticReporter(diagnostic);
		}
		reportText(
			`Found ${emitResult.diagnostics.length} error${
				emitResult.diagnostics.length === 1 ? "" : "s"
			}. Watching for file changes.`,
		);
	}

	chokidar
		.watch(getRootDirs(options), {
			awaitWriteFinish: {
				pollInterval: 10,
				stabilityThreshold: 50,
			},
			ignoreInitial: true,
			disableGlobbing: true,
			usePolling,
		})
		.on("change", fsPath => compile(fsPath))
		.on("add", fsPath => {
			fileNames.push(fsPath);
			compile(fsPath);
		})
		.on("unlink", fsPath => {
			assert(services);
			fileNames = fileNames.filter(v => v === fsPath);
			const outPath = services.pathTranslator.getOutputPath(fsPath);
			tryRemove(services.pathTranslator, outPath);
		});

	reportText("Starting compilation in watch mode...");
	compile();
}
