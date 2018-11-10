import * as fs from "fs-extra";
import * as path from "path";
import { Compiler } from "./class/Compiler";
import { DiagnosticError } from "./class/errors/DiagnosticError";
import { TranspilerError, TranspilerErrorType } from "./class/errors/TranspilerError";

require("mocha");

interface ErrorMatix {
	[propName: string]: {
		message: string;
		instance: any;
		type?: TranspilerErrorType;
	};
}

const compilerArgs = {
	ci: true,
	includePath: "include",
	modulesPath: "modules",
	noHeader: false,
	noHeuristics: true,
	noStrict: false,
};

const errorMatrix: ErrorMatix = {
	"var.spec.ts": {
		message: "should not allow var keyword",
		instance: TranspilerError,
		type: TranspilerErrorType.NoVarKeyword,
	},
	"diagnostic.spec.ts": {
		message: "should not allow diagnostic errors",
		instance: DiagnosticError,
	},
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
	for (const file in errorMatrix) {
		it(errorMatrix[file].message, done => {
			compile("errors/" + file)
				.then(() => done("Did not throw!"))
				.catch(e => {
					if (e instanceof errorMatrix[file].instance) {
						if (errorMatrix[file].type === undefined) {
							done();
						} else if (errorMatrix[file].type === e.type) {
							done();
						} else {
							done("Unexpected error");
						}
					} else {
						done("Unexpected error");
					}
				});
		});
	}
});
