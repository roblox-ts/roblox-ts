import { describe } from "mocha";
import path from "path";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProjectData } from "Project/functions/createProjectData";
import { createProjectProgram } from "Project/functions/createProjectProgram";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { PACKAGE_ROOT, TS_EXT, TSX_EXT } from "Shared/constants";
import { DiagnosticFactory, errors, getDiagnosticId } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";
import { getRootDirs } from "Shared/util/getRootDirs";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";

const DIAGNOSTIC_TEST_NAME_REGEX = /^(\w+)(?:\.\d+)?\.?(\d+)?$/;

describe("should compile tests project", () => {
	const data = createProjectData(
		path.join(PACKAGE_ROOT, "tests", "tsconfig.json"),
		{},
		{
			logTruthyChanges: false,
			noInclude: false,
			project: "",
			usePolling: false,
			verbose: false,
			watch: false,
			writeOnlyChanged: false,
		},
	);
	const program = createProjectProgram(data);
	const pathTranslator = createPathTranslator(program);

	it("should copy include files", () => copyInclude(data));

	it("should copy non-compiled files", () =>
		copyFiles(data, pathTranslator, new Set(getRootDirs(program.getCompilerOptions()))));

	const diagnosticsFolder = path.join(PACKAGE_ROOT, "tests", "src", "diagnostics");

	for (const sourceFile of getChangedSourceFiles(program)) {
		const fileName = path.relative(process.cwd(), sourceFile.fileName);
		if (isPathDescendantOf(path.normalize(sourceFile.fileName), diagnosticsFolder)) {
			let fileBaseName = path.basename(sourceFile.fileName);
			const ext = path.extname(fileBaseName);
			if (ext === TS_EXT || ext === TSX_EXT) {
				fileBaseName = path.basename(sourceFile.fileName, ext);
			}
			const regexResults = fileBaseName.match(DIAGNOSTIC_TEST_NAME_REGEX);
			const diagnosticName = regexResults?.[1] as keyof typeof errors;
			assert(diagnosticName && errors[diagnosticName], `Diagnostic test for unknown diagnostic ${fileBaseName}`);
			const repeatAmount = (regexResults && parseInt(regexResults?.[2])) || 1;
			const expectedId = (errors[diagnosticName] as DiagnosticFactory).id;
			it(`should compile ${fileName} and report diagnostic ${diagnosticName}${
				repeatAmount > 1 ? ` ${repeatAmount} times` : ""
			}`, done => {
				const emitResult = compileFiles(program.getProgram(), data, pathTranslator, [sourceFile]);
				if (
					emitResult.diagnostics.length === repeatAmount &&
					emitResult.diagnostics.every(d => getDiagnosticId(d) === expectedId)
				) {
					done();
				} else if (emitResult.diagnostics.length === 0) {
					done(new Error(`Expected diagnostic ${diagnosticName} to be reported.`));
				} else {
					done(
						new Error(
							"Did not receive precisely 1 diagnostic:\n" + formatDiagnostics(emitResult.diagnostics),
						),
					);
				}
			});
		} else {
			it(`should compile ${fileName}`, done => {
				const emitResult = compileFiles(program.getProgram(), data, pathTranslator, [sourceFile]);
				if (emitResult.diagnostics.length > 0) {
					done(new Error("\n" + formatDiagnostics(emitResult.diagnostics)));
				} else {
					done();
				}
			});
		}
	}
});
