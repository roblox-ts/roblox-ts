import fs from "fs-extra";
import { describe, it } from "mocha";
import path from "path";
import util from "util";
import { CompilerError, CompilerErrorType } from "./errors/CompilerError";
import { DiagnosticError } from "./errors/DiagnosticError";
import { ProjectError, ProjectErrorType } from "./errors/ProjectError";
import { Project } from "./Project";
import { red } from "./utility";

interface ErrorMatrix {
	[propName: string]: {
		message: string;
		instance: any;
		type?: CompilerErrorType;
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
		instance: CompilerError,
		type: CompilerErrorType.NoVarKeyword,
	},
	"reservedLuaKeywords.spec.ts": {
		message: "should not allow usage of reserved lua keywords",
		instance: CompilerError,
		type: CompilerErrorType.ReservedKeyword,
	},
	"breakLabel.spec.ts": {
		message: "should not allow usage of break labels",
		instance: CompilerError,
		type: CompilerErrorType.NoLabeledStatement,
	},
	"continueLabel.spec.ts": {
		message: "should not allow usage of continue labels",
		instance: CompilerError,
		type: CompilerErrorType.NoLabeledStatement,
	},
	"constructorReturn.spec.ts": {
		message: "should not allow return in class constructor",
		instance: CompilerError,
		type: CompilerErrorType.NoConstructorReturn,
	},
	"null.spec.ts": {
		message: "should not allow usage of null",
		instance: CompilerError,
		type: CompilerErrorType.NoNull,
	},
	"reservedMetamethod.spec.ts": {
		message: "should not allow usage of reserved metamethod names",
		instance: CompilerError,
		type: CompilerErrorType.ReservedMethodName,
	},
	"spreadDestructure.spec.ts": {
		message: "should not allow usage of spread in destructure statements",
		instance: CompilerError,
		type: CompilerErrorType.SpreadDestructuring,
	},
	"roactClassGet.spec.tsx": {
		message: "should not allow getters in roact classes",
		instance: CompilerError,
		type: CompilerErrorType.RoactGettersNotAllowed,
	},
	"roactClassSet.spec.tsx": {
		message: "should not allow setters in roact classes",
		instance: CompilerError,
		type: CompilerErrorType.RoactSettersNotAllowed,
	},
	"roactSubClass.spec.tsx": {
		message: "should not allow subclasses of roact components",
		instance: CompilerError,
		type: CompilerErrorType.RoactSubClassesNotSupported,
	},
	"roactJsxText.spec.tsx": {
		message: "should not allow text between jsx elements",
		instance: CompilerError,
		type: CompilerErrorType.RoactJsxTextNotSupported,
	},
	"roactNew.spec.tsx": {
		message: "should not allow roact components to be created with new keyword",
		instance: CompilerError,
		type: CompilerErrorType.RoactNoNewComponentAllowed,
	},
	"invalidId.spec.ts": {
		message: "should not allow invalid identifiers to be used",
		instance: CompilerError,
		type: CompilerErrorType.InvalidIdentifier,
	},
	"luaTupleInConditional.spec.ts": {
		message: "should not allow LuaTuples in conditionals",
		instance: CompilerError,
		type: CompilerErrorType.LuaTupleInConditional,
	},
	"luaTupleInIf.spec.ts": {
		message: "should not allow LuaTuples in if statements",
		instance: CompilerError,
		type: CompilerErrorType.LuaTupleInConditional,
	},
	"luaTupleInElseIf.spec.ts": {
		message: "should not allow LuaTuples in else if statements",
		instance: CompilerError,
		type: CompilerErrorType.LuaTupleInConditional,
	},
	"reservedId.spec.ts": {
		message: "should not allow reserved identifiers to be used",
		instance: CompilerError,
		type: CompilerErrorType.RobloxTSReservedIdentifier,
	},
	// TODO: Readd these tests
	// "invalidAccess.spec.server.ts": {
	// 	message: "should not allow client only API to be accessed by server code",
	// 	instance: CompilerError,
	// 	type: CompilerErrorType.InvalidClientOnlyAPIAccess,
	// },
	// "invalidAccess.spec.client.ts": {
	// 	message: "should not allow server only API to be accessed by client code",
	// 	instance: CompilerError,
	// 	type: CompilerErrorType.InvalidServerOnlyAPIAccess,
	// },
	"equalsEquals.ts": {
		message: "should not allow ==",
		instance: CompilerError,
		type: CompilerErrorType.NoEqualsEquals,
	},
	"exclamationEquals.ts": {
		message: "should not allow !=",
		instance: CompilerError,
		type: CompilerErrorType.NoExclamationEquals,
	},
	"dynamicImport.spec.ts": {
		message: "should not allow dynamic imports",
		instance: CompilerError,
		type: CompilerErrorType.NoDynamicImport,
	},
	"macroIndex.spec.ts": {
		message: "should not allowing indexing macro methods without call",
		instance: CompilerError,
		type: CompilerErrorType.InvalidMacroIndex,
	},
	"classPrototype.spec.ts": {
		message: "should not allowing indexing class prototype",
		instance: CompilerError,
		type: CompilerErrorType.NoClassPrototype,
	},
	"indexFunction.spec.ts": {
		message: "should not allowing indexing functions",
		instance: CompilerError,
		type: CompilerErrorType.NoFunctionIndex,
	},
	"invalidMetamethod.spec.ts": {
		message: "should not allowing reserved metamethods",
		instance: CompilerError,
		type: CompilerErrorType.UndefinableMetamethod,
	},
	"unexpectedInitializerForOf.spec.ts": {
		message: "should not allow expressions as initializers in for-of loops",
		instance: CompilerError,
		type: CompilerErrorType.UnexpectedInitializer,
	},
	"disallowForIn.spec.ts": {
		message: "should not allow for-in loops",
		instance: CompilerError,
		type: CompilerErrorType.ForInLoop,
	},
	"exportNonModule.spec.server.ts": {
		message: "should not allow exporting from a non-ModuleScript",
		instance: CompilerError,
		type: CompilerErrorType.ExportInNonModuleScript,
	},
	"typeof.spec.ts": {
		message: "should not allow typeof operator",
		instance: CompilerError,
		type: CompilerErrorType.NoTypeOf,
	},
	"any/index.spec.ts": {
		message: "should not allow indexing type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/call.spec.ts": {
		message: "should not allow calling type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/pass.spec.ts": {
		message: "should not allow passing type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/computedAccess.spec.ts": {
		message: "should not allow computed accessing type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/computedAccess2.spec.ts": {
		message: "should not allow computed accessing type any #2",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/func.spec.ts": {
		message: "should not allow functions that return type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/add.spec.ts": {
		message: "should not allow adding type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/sub.spec.ts": {
		message: "should not allow subtracting type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/mul.spec.ts": {
		message: "should not allow multiplying type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"any/div.spec.ts": {
		message: "should not allow dividing type any",
		instance: CompilerError,
		type: CompilerErrorType.NoAny,
	},
	"methodDestructure/arr.spec.1.ts": {
		message: "should not allow method indexing from arrays",
		instance: CompilerError,
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.2.ts": {
		message: "should not allow method indexing from arrays",
		instance: CompilerError,
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.3.ts": {
		message: "should not allow method indexing from arrays",
		instance: CompilerError,
		type: CompilerErrorType.InvalidMacroIndex,
	},
	"methodDestructure/arr.spec.4.ts": {
		message: "should not allow method indexing from arrays",
		instance: CompilerError,
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.5.ts": {
		message: "should not allow method indexing from arrays",
		instance: CompilerError,
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.6.ts": {
		message: "should not allow method indexing from arrays",
		instance: CompilerError,
		type: CompilerErrorType.BadDestructuringType,
	},
	"methodDestructure/arr.spec.7.ts": {
		message: "should not allow method indexing from arrays",
		instance: CompilerError,
		type: CompilerErrorType.BadDestructuringType,
	},
	"methodDestructure/map.spec.1.ts": {
		message: "should not allow indexing from Maps",
		instance: CompilerError,
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/map.spec.2.ts": {
		message: "should not allow indexing from Maps",
		instance: CompilerError,
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/union.spec.ts": {
		message: "should not allow Array and Object unions to be indexed from",
		instance: CompilerError,
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"roactInitMethod.spec.ts": {
		message: "should not allow init in Roact class",
		instance: CompilerError,
		type: CompilerErrorType.RoactNoReservedMethods,
	},
	"tupleLength1.spec.ts": {
		message: "should not allow indexing the length property of tuples",
		instance: CompilerError,
		type: CompilerErrorType.TupleLength,
	},
	"tupleLength2.spec.ts": {
		message: "should not allow indexing the length property of tuples",
		instance: CompilerError,
		type: CompilerErrorType.TupleLength,
	},
	"tupleLength3.spec.ts": {
		message: "should not allow indexing the length property of tuples",
		instance: CompilerError,
		type: CompilerErrorType.TupleLength,
	},
	"extendedMapClass.spec.ts": {
		message: "should not allow creating classes which extend Map",
		instance: CompilerError,
		type: CompilerErrorType.BadClassExtends,
	},
	"extendedSetClass.spec.ts": {
		message: "should not allow creating classes which extend Set",
		instance: CompilerError,
		type: CompilerErrorType.BadClassExtends,
	},
};
/* tslint:enable:object-literal-sort-keys */

const compilerArgs = {
	ci: true,
	includePath: "../lib",
	modulesPath: "modules",
	noInclude: true,
	project: "tests",
	rojo: "",
};

const srcFolder = path.resolve("tests", "src");
const project = new Project(compilerArgs);

async function compile(filePath: string) {
	return project.compileFileByPath(filePath);
}

function testFolder(folderPath: string) {
	for (const name of fs.readdirSync(folderPath)) {
		if (name !== "errors") {
			it(name, async () => {
				process.exitCode = 0;
				try {
					await compile(path.join(folderPath, name));
				} catch (e) {
					if (e instanceof CompilerError) {
						throw new Error(
							util.format(
								"%s:%d:%d - %s %s",
								path.relative(srcFolder, e.node.getSourceFile().getFilePath()),
								e.node.getStartLineNumber(),
								e.node.getNonWhitespaceStart() - e.node.getStartLinePos(),
								red("Compiler Error:"),
								e.message,
							),
						);
					} else if (e instanceof ProjectError) {
						throw new Error(util.format("%s %s", red("Project Error:"), e.message));
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
					} else if (e instanceof CompilerError) {
						done(`Unexpected CompilerError: ${CompilerErrorType[e.type]}`);
					} else if (e instanceof ProjectError) {
						done(`Unexpected ProjectError: ${ProjectErrorType[e.type]}`);
					} else if (e instanceof DiagnosticError) {
						done(`Unexpected DiagnosticError:\n${e.errors.join("\n")}`);
					} else {
						done(`Unexpected error: ${String(e)}`);
					}
				});
		});
	}
});
