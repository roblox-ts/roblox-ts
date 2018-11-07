import { Compiler } from "./class/Compiler";

require("mocha");

describe("compile", () => {
	it("should compile all test cases", done => {
		const args = {
			includePath: "include",
			modulesPath: "modules",
			noHeader: false,
			noHeuristics: false,
			noStrict: false,
		};
		const compiler = new Compiler("tests/tsconfig.json", args);
		compiler
			.compileAll(true)
			.catch(reason => done(reason))
			.then(() => done());
	});
});
