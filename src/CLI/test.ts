import { describe } from "mocha";
import path from "path";
import { Project } from "Project";
import { PACKAGE_ROOT } from "Shared/constants";

describe("should compile tests project", () => {
	it("should copy include files", () => project.copyInclude());
	it("should copy non-compiled files", () => project.copyFiles(new Set(project.getRootDirs())));

	const project = new Project(path.join(PACKAGE_ROOT, "tests", "tsconfig.json"), {}, false);
	for (const sourceFile of project.getChangedSourceFiles()) {
		const fileName = path.relative(process.cwd(), sourceFile.fileName);
		it(`should compile ${fileName}`, () => project.compileFiles([sourceFile]));
	}
});
