import * as fs from "fs-extra";
import * as path from "path";
import * as util from "util";
import { Compiler } from "./Compiler";
import { CompilerError, CompilerErrorType } from "./errors/CompilerError";
import { DiagnosticError } from "./errors/DiagnosticError";
import { TranspilerError, TranspilerErrorType } from "./errors/TranspilerError";
import { red } from "./utility";

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
	"roactClassGet.spec.tsx": {
		message: "should not allow getters in roact classes",
		instance: TranspilerError,
		type: TranspilerErrorType.RoactGettersNotAllowed,
	},
	"roactClassSet.spec.tsx": {
		message: "should not allow setters in roact classes",
		instance: TranspilerError,
		type: TranspilerErrorType.RoactSettersNotAllowed,
	},
	"roactSubClass.spec.tsx": {
		message: "should not allow subclasses of roact components",
		instance: TranspilerError,
		type: TranspilerErrorType.RoactSubClassesNotSupported,
	},
	"roactJsxText.spec.tsx": {
		message: "should not allow text between jsx elements",
		instance: TranspilerError,
		type: TranspilerErrorType.RoactJsxTextNotSupported,
	},
	"roactNew.spec.tsx": {
		message: "should not allow roact components to be created with new keyword",
		instance: TranspilerError,
		type: TranspilerErrorType.RoactNoNewComponentAllowed,
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
				try {
					await compile(name);
				} catch (e) {
					if (e instanceof TranspilerError) {
						throw new Error(
							util.format(
								"%s:%d:%d - %s %s",
								path.relative(srcFolder, e.node.getSourceFile().getFilePath()),
								e.node.getStartLineNumber(),
								e.node.getNonWhitespaceStart() - e.node.getStartLinePos(),
								red("Transpiler Error:"),
								e.message,
							),
						);
					} else if (e instanceof CompilerError) {
						throw new Error(util.format("%s %s", red("Compiler Error:"), e.message));
					} else if (e instanceof DiagnosticError) {
						throw new Error(`DiagnosticError:\n${e.errors.join("\n")}`);
					} else {
						throw new Error(`Unexpected Error: ${String(e)}`);
					}
				}
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
					if (e instanceof errorMatrix[file].instance && errorMatrix[file].type === undefined) {
						done();
					} else if (e instanceof errorMatrix[file].instance && errorMatrix[file].type === e.type) {
						done();
					} else if (e instanceof TranspilerError) {
						done(`Unexpected TranspilerError: ${TranspilerErrorType[e.type]}`);
					} else if (e instanceof CompilerError) {
						done(`Unexpected CompilerError: ${CompilerErrorType[e.type]}`);
					} else if (e instanceof DiagnosticError) {
						done(`Unexpected DiagnosticError:\n${e.errors.join("\n")}`);
					} else {
						done(`Unexpected error: ${String(e)}`);
					}
				});
		});
	}
});
