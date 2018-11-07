import { Compiler } from "./class/Compiler";

require("mocha");

describe("compile", () => {
	it("should compile all test cases", async () => {
		const args = {
			includePath: "include",
			modulesPath: "modules",
			noHeader: false,
			noHeuristics: true,
			noStrict: false,
		};
		process.exitCode = 0;
		const compiler = new Compiler("tests/tsconfig.json", args);
		await compiler.compileAll(true);
		if (process.exitCode !== 0) {
			throw new Error("non-zero exit code");
		}
	});
});
