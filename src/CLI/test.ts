import { describe } from "mocha";
import path from "path";
import { Project } from "Project";
import { PACKAGE_ROOT } from "Shared/constants";

describe("compile tests", () => {
	const project = new Project(path.join(PACKAGE_ROOT, "tests", "tsconfig.json"), {});
	project.compileAll((name, callback) => it(name, callback));
});
