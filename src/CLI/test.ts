import { describe } from "mocha";
import path from "path";
import { Project } from "Project";
import { PACKAGE_ROOT } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";

describe("should compile tests project", () => {
	const project = new Project(
		path.join(PACKAGE_ROOT, "tests", "tsconfig.json"),
		{},
		{
			noInclude: false,
			project: "",
			verbose: false,
			watch: false,
		},
	);

	it("should copy include files", () => project.copyInclude());

	it("should copy non-compiled files", () => project.copyFiles(new Set(project.getRootDirs())));

	for (const sourceFile of project.getChangedSourceFiles()) {
		const fileName = path.relative(process.cwd(), sourceFile.fileName);
		it(`should compile ${fileName}`, done => {
			try {
				project.compileFiles([sourceFile]);
				done();
			} catch (e) {
				if (e instanceof ProjectError || e instanceof DiagnosticError) {
					done(new Error("\n" + e.toString()));
				} else {
					done(e);
				}
			}
		});
	}
});
