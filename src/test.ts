import * as fs from "fs-extra";
import { describe, it } from "mocha";
import * as path from "path";
import * as util from "util";
import { Compiler } from "./Compiler";
import { CompilerError, CompilerErrorType } from "./errors/CompilerError";
import { DiagnosticError } from "./errors/DiagnosticError";
import { TranspilerError, TranspilerErrorType } from "./errors/TranspilerError";
import { red } from "./utility";

interface ErrorMatrix {
	[propName: string]: {
		message: string;
		instance: any;
		type?: TranspilerErrorType;
	};
}

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
	"invalidId.spec.ts": {
		message: "should not allow invalid identifiers to be used",
		instance: TranspilerError,
		type: TranspilerErrorType.InvalidIdentifier,
	},
	"reservedId.spec.ts": {
		message: "should not allow reserved identifiers to be used",
		instance: TranspilerError,
		type: TranspilerErrorType.RobloxTSReservedIdentifier,
	},
	"invalidAccess.spec.server.ts": {
		message: "should not allow client only API to be accessed by server code",
		instance: TranspilerError,
		type: TranspilerErrorType.InvalidClientOnlyAPIAccess,
	},
	"invalidAccess.spec.client.ts": {
		message: "should not allow server only API to be accessed by client code",
		instance: TranspilerError,
		type: TranspilerErrorType.InvalidServerOnlyAPIAccess,
	},
	"equalsEquals.ts": {
		message: "should not allow ==",
		instance: TranspilerError,
		type: TranspilerErrorType.NoEqualsEquals,
	},
	"exclamationEquals.ts": {
		message: "should not allow !=",
		instance: TranspilerError,
		type: TranspilerErrorType.NoExclamationEquals,
	},
	"dynamicImport.spec.ts": {
		message: "should not allow dynamic imports",
		instance: TranspilerError,
		type: TranspilerErrorType.NoDynamicImport,
	},
	"macroIndex.spec.ts": {
		message: "should not allowing indexing macro methods without call",
		instance: TranspilerError,
		type: TranspilerErrorType.InvalidMacroIndex,
	},
	"classPrototype.spec.ts": {
		message: "should not allowing indexing class prototype",
		instance: TranspilerError,
		type: TranspilerErrorType.NoClassPrototype,
	},
	"indexFunction.spec.ts": {
		message: "should not allowing indexing functions",
		instance: TranspilerError,
		type: TranspilerErrorType.NoFunctionIndex,
	},
	"invalidMetamethod.spec.ts": {
		message: "should not allowing reserved metamethods",
		instance: TranspilerError,
		type: TranspilerErrorType.UndefinableMetamethod,
	},
	"unexpectedInitializerForOf.spec.ts": {
		message: "should not allow expressions as initializers in for-of loops",
		instance: TranspilerError,
		type: TranspilerErrorType.UnexpectedInitializer,
	},
	"unexpectedInitializerForIn.spec.ts": {
		message: "should not allow expressions as initializers in for-in loops",
		instance: TranspilerError,
		type: TranspilerErrorType.UnexpectedInitializer,
	},
	"exportNonModule.spec.server.ts": {
		message: "should not allow exporting from a non-ModuleScript",
		instance: TranspilerError,
		type: TranspilerErrorType.ExportInNonModuleScript,
	},
	"any/index.spec.ts": {
		message: "should not allow indexing type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/call.spec.ts": {
		message: "should not allow calling type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/pass.spec.ts": {
		message: "should not allow passing type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/computedAccess.spec.ts": {
		message: "should not allow computed accessing type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/computedAccess2.spec.ts": {
		message: "should not allow computed accessing type any #2",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/func.spec.ts": {
		message: "should not allow functions that return type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/add.spec.ts": {
		message: "should not allow adding type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/sub.spec.ts": {
		message: "should not allow subtracting type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/mul.spec.ts": {
		message: "should not allow multiplying type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
	"any/div.spec.ts": {
		message: "should not allow dividing type any",
		instance: TranspilerError,
		type: TranspilerErrorType.NoAny,
	},
};
/* tslint:enable:object-literal-sort-keys */

const compilerArgs = {
	ci: true,
	includePath: "include",
	modulesPath: "modules",
	project: "tests",
};

const srcFolder = path.resolve("tests", "src");
const compiler = new Compiler(compilerArgs);

async function compile(filePath: string) {
	return compiler.compileFileByPath(filePath);
}

function testFolder(folderPath: string) {
	for (const name of fs.readdirSync(folderPath)) {
		if (name !== "errors") {
			it(name, async () => {
				process.exitCode = 0;
				try {
					await compile(path.join(folderPath, name));
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
}

describe("compile integration tests", () => testFolder(srcFolder));

describe("compile integration tests for imports", () => testFolder(path.join(srcFolder, "imports")));

describe("compile error unit tests", () => {
	for (const file in errorMatrix) {
		it(errorMatrix[file].message, done => {
			compile(path.join(srcFolder, "errors", file))
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
