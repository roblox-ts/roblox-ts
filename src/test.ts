import * as fs from "fs-extra";
import * as path from "path";
import { Compiler } from "./class/Compiler";
import { DiagnosticError } from "./class/errors/DiagnosticError";
import { TranspilerError, TranspilerErrorType } from "./class/errors/TranspilerError";

require("mocha");

const compilerArgs = {
	ci: true,
	includePath: "include",
	modulesPath: "modules",
	noHeader: false,
	noHeuristics: true,
	noStrict: false,
};

const tsconfigPath = "tests/tsconfig.json";
const srcFolder = path.resolve("tests", "src");
const compiler = new Compiler(tsconfigPath, compilerArgs);

async function compile(relativePath: string) {
	return compiler.compileFileByPath(path.resolve(srcFolder, relativePath));
}

describe("compile integration tests", () => {
	// compile integration tests
	for (const name of fs.readdirSync(srcFolder)) {
		if (name !== "errors") {
			it(name, async () => {
				process.exitCode = 0;
				await compile(name);
				if (process.exitCode !== 0) {
					throw new Error("non-zero exit code");
				}
			});
		}
	}
});

describe("compile error unit tests", () => {
	// compiler error unit tests
	it("should not allow var keyword", done => {
		compile("errors/var.spec.ts")
			.then(() => done("Did not throw!"))
			.catch(e => {
				if (e instanceof TranspilerError && e.type === TranspilerErrorType.NoVarKeyword) {
					done();
				} else {
					done("Unexpected error");
				}
			});
	});

	it("should not allow diagnostic errors", done => {
		compile("errors/diagnostic.spec.ts")
			.then(() => done("Did not throw!"))
			.catch(e => {
				if (e instanceof DiagnosticError) {
					done();
				} else {
					done("Unexpected error");
				}
			});
	});
});
