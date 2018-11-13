import * as fs from "fs-extra";
import * as path from "path";
import { Compiler } from "./class/Compiler";
import { DiagnosticError } from "./class/errors/DiagnosticError";
import { TranspilerError, TranspilerErrorType } from "./class/errors/TranspilerError";

require("mocha");

interface ErrorMatrix {
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

/* tslint:disable:object-literal-sort-keys */
const errorMatrix: ErrorMatrix = {
	"diagnostic.spec.ts": {
		message: "should not allow diagnostic errors",
		instance: DiagnosticError,
	},
	"var.spec.ts": {
		message: "should not allow var keyword",
		instance: TranspilerError,
		type: TranspilerErrorType.NoVarKeyword,
	},
	"reservedLuaKeywords.spec.ts": {
		message: "should not allow usage of reserved lua keywords",
		instance: TranspilerError,
		type: TranspilerErrorType.ReservedKeyword,
	},
	"breakLabel.spec.ts": {
		message: "should not allow usage of break labels",
		instance: TranspilerError,
		type: TranspilerErrorType.NoLabeledStatement,
	},
	"continueLabel.spec.ts": {
		message: "should not allow usage of continue labels",
		instance: TranspilerError,
		type: TranspilerErrorType.NoLabeledStatement,
	},
	"constructorReturn.spec.ts": {
		message: "should not allow return in class constructor",
		instance: TranspilerError,
		type: TranspilerErrorType.NoConstructorReturn,
	},
	"null.spec.ts": {
		message: "should not allow usage of null",
		instance: TranspilerError,
		type: TranspilerErrorType.NoNull,
	},
	"reservedMetamethod.spec.ts": {
		message: "should not allow usage of reserved metamethod names",
		instance: TranspilerError,
		type: TranspilerErrorType.ReservedMethodName,
	},
	"spreadDestructure.spec.ts": {
		message: "should not allow usage of spread in destructure statements",
		instance: TranspilerError,
		type: TranspilerErrorType.SpreadDestructuring,
	},
};
/* tslint:enable:object-literal-sort-keys */

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
							done(`Unexpected TranspilerErrorType: ${TranspilerErrorType[e.type]}`);
						}
					} else {
						done("Unexpected error");
					}
				});
		});
	}
});
