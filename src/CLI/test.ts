import { describe } from "mocha";
import path from "path";
import { createProjectData, createProjectProgram, createProjectServices } from "Project/functions/bootstrap";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getRootDirs } from "Project/functions/getRootDirs";
import { PACKAGE_ROOT } from "Shared/constants";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

describe("should compile tests project", () => {
	const data = createProjectData(
		path.join(PACKAGE_ROOT, "tests", "tsconfig.json"),
		{},
		{
			project: "",
			verbose: false,
			watch: false,
			usePolling: false,
			noInclude: false,
		},
	);
	const program = createProjectProgram(data);
	const services = createProjectServices(program, data);

	it("should copy include files", () => copyInclude(data));

	it("should copy non-compiled files", () => {
		copyFiles(program, services, new Set(getRootDirs(program.getCompilerOptions())));
	});

	for (const sourceFile of getChangedSourceFiles(program)) {
		const fileName = path.relative(process.cwd(), sourceFile.fileName);
		it(`should compile ${fileName}`, done => {
			const emitResult = compileFiles(program, data, services, [sourceFile]);
			if (emitResult.diagnostics.length > 0) {
				done(new Error("\n" + formatDiagnostics(emitResult.diagnostics)));
			} else {
				done();
			}
		});
	}
});
