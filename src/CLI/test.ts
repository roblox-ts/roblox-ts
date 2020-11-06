import { describe } from "mocha";
import path from "path";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { createProjectData } from "Project/functions/createProjectData";
import { createProjectProgram } from "Project/functions/createProjectProgram";
import { createProjectServices } from "Project/functions/createProjectServices";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getRootDirs } from "Project/util/getRootDirs";
import { PACKAGE_ROOT, TSX_EXT, TS_EXT } from "Shared/constants";
import { errors, getDiagnosticId } from "Shared/diagnostics";
import { isPathDescendantOf } from "Shared/fsUtil";
import { assert } from "Shared/util/assert";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

const DIAGNOSTIC_TEST_NAME_REGEX = /^(\w+)(?:\.\d+)?$/;

describe("should compile tests project", () => {
	const data = createProjectData(
		path.join(PACKAGE_ROOT, "tests", "tsconfig.json"),
		{},
		{
			logStringChanges: false,
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
	const services = createProjectServices(program, data);

	it("should copy include files", () => copyInclude(data));

	it("should copy non-compiled files", () =>
		copyFiles(data, services, new Set(getRootDirs(program.getCompilerOptions()))));

	const diagnosticsFolder = path.join(PACKAGE_ROOT, "tests", "src", "diagnostics");

	for (const sourceFile of getChangedSourceFiles(program)) {
		const fileName = path.relative(process.cwd(), sourceFile.fileName);
		if (isPathDescendantOf(path.normalize(sourceFile.fileName), diagnosticsFolder)) {
			let fileBaseName = path.basename(sourceFile.fileName);
			const ext = path.extname(fileBaseName);
			if (ext === TS_EXT || ext === TSX_EXT) {
				fileBaseName = path.basename(sourceFile.fileName, ext);
			}
			const diagnosticName = fileBaseName.match(DIAGNOSTIC_TEST_NAME_REGEX)?.[1];
			assert(diagnosticName);
			const expectedId = errors[diagnosticName as keyof typeof errors].id;
			it(`should compile ${fileName} and report diagnostic ${diagnosticName}`, done => {
				const emitResult = compileFiles(program.getProgram(), data, services, [sourceFile]);
				if (
					emitResult.diagnostics.length > 0 &&
					emitResult.diagnostics.every(d => getDiagnosticId(d) === expectedId)
				) {
					done();
				} else if (emitResult.diagnostics.length === 0) {
					done(new Error(`Expected diagnostic ${diagnosticName} to be reported.`));
				} else {
					done(new Error("Unexpected diagnostics:\n" + formatDiagnostics(emitResult.diagnostics)));
				}
			});
		} else {
			it(`should compile ${fileName}`, done => {
				const emitResult = compileFiles(program.getProgram(), data, services, [sourceFile]);
				if (emitResult.diagnostics.length > 0) {
					done(new Error("\n" + formatDiagnostics(emitResult.diagnostics)));
				} else {
					done();
				}
			});
		}
	}
});
