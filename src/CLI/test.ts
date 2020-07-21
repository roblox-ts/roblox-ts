import { describe } from "mocha";
import path from "path";
import { Project } from "Project";
import { PACKAGE_ROOT } from "Shared/constants";

describe("compile tests", () => {
	const project = new Project(path.join(PACKAGE_ROOT, "tests", "tsconfig.json"), {}, false);
	for (const fileName of project.getChangedFilesSet()) {
		it(fileName, () => project.compileFiles(new Set([fileName])));
	}
	it("should copy include files", () => project.copyInclude());
	it("should copy non-compiled files", () => project.copyFiles(new Set(project.getRootDirs())));
});
