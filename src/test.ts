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
		const compiler = new Compiler("tests/tsconfig.json", args);
		await compiler.compileAll(true, true);
		if (process.exitCode !== 0) {
			throw new Error("exit code non-zero!");
		}
	});
});
