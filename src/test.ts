import fs from "fs-extra";
import { describe, it } from "mocha";
import path from "path";
import util from "util";
import { CompilerError, CompilerErrorType } from "./errors/CompilerError";
import { DiagnosticError } from "./errors/DiagnosticError";
import { ProjectError, ProjectErrorType } from "./errors/ProjectError";
import { Project } from "./Project";
import { red } from "./utility/text";

interface ErrorMatrix {
	[propName: string]: {
		message: string;
		type: CompilerErrorType;
	};
}

const DIAGNOSTIC_TEST_NAME = "diagnostic.spec.ts";

const errorMatrix: ErrorMatrix = {
	"var.spec.ts": {
		message: "should not allow var keyword",
		type: CompilerErrorType.NoVarKeyword,
	},
	"reservedLuaKeywords.spec.ts": {
		message: "should not allow usage of reserved lua keywords",
		type: CompilerErrorType.ReservedKeyword,
	},
	"breakLabel.spec.ts": {
		message: "should not allow usage of break labels",
		type: CompilerErrorType.NoLabeledStatement,
	},
	"continueLabel.spec.ts": {
		message: "should not allow usage of continue labels",
		type: CompilerErrorType.NoLabeledStatement,
	},
	"constructorReturn.spec.ts": {
		message: "should not allow return in class constructor",
		type: CompilerErrorType.NoConstructorReturn,
	},
	"null.spec.ts": {
		message: "should not allow usage of null",
		type: CompilerErrorType.NoNull,
	},
	"reservedMetamethod.spec.ts": {
		message: "should not allow usage of reserved metamethod names",
		type: CompilerErrorType.ReservedMethodName,
	},
	"spreadDestructure.spec.ts": {
		message: "should not allow usage of spread in destructure statements",
		type: CompilerErrorType.SpreadDestructuring,
	},
	"spreadDestructure2.spec.ts": {
		message: "should not allow usage of spread in destructure statements",
		type: CompilerErrorType.SpreadDestructuring,
	},
	"roact/roactInitMethod.spec.ts": {
		message: "should not allow init in Roact class",
		type: CompilerErrorType.RoactNoReservedMethods,
	},
	"roact/roactSubClass.spec.tsx": {
		message: "should not allow subclasses of roact components",
		type: CompilerErrorType.RoactSubClassesNotSupported,
	},
	"roact/roactJsxText.spec.tsx": {
		message: "should not allow text between jsx elements",
		type: CompilerErrorType.RoactJsxTextNotSupported,
	},
	"roact/roactReservedName.spec.tsx": {
		message: "should not allow reserved roact names declared in classes",
		type: CompilerErrorType.RoactNoReservedMethods,
	},
	"roact/roactExtendMethod.spec.ts": {
		message: "should not allow extend declared in roact classes",
		type: CompilerErrorType.RoactNoReservedMethods,
	},
	"roact/roactNew.spec.tsx": {
		message: "should not allow roact components to be created with new keyword",
		type: CompilerErrorType.RoactNoNewComponentAllowed,
	},
	"roact/jsxMethodDeclarationCallbackProperty.spec.tsx": {
		message: "should not allow putting a method as a callback in jsx props",
		type: CompilerErrorType.RoactInvalidCallExpression,
	},
	"roact/jsxExpressionNonRoactIdentifier.spec.tsx": {
		message: "should not allow invalid identifiers as jsx expressions",
		type: CompilerErrorType.RoactInvalidIdentifierExpression,
	},
	"roact/jsxExpressionNonElementReturningCall.spec.tsx": {
		message: "should not allow invalid return types from jsx expressions with function calls",
		type: CompilerErrorType.RoactInvalidCallExpression,
	},
	"roact/jsxExpressionBinaryRight.spec.tsx": {
		message: "should not allow binary jsx expressions that result in non-element values if true",
		type: CompilerErrorType.RoactInvalidExpression,
	},
	"roact/jsxExpressionConditionalIfFalse.spec.tsx": {
		message: "should not allow conditional jsx expressions that result in non-element if false",
		type: CompilerErrorType.RoactInvalidExpression,
	},
	"roact/jsxExpressionConditionalIfTrue.spec.tsx": {
		message: "should not allow conditional jsx expressions that result in non-element if true",
		type: CompilerErrorType.RoactInvalidExpression,
	},
	"luaTupleInConditional.spec.ts": {
		message: "should not allow LuaTuples in conditionals",
		type: CompilerErrorType.LuaTupleInConditional,
	},
	"luaTupleInIf.spec.ts": {
		message: "should not allow LuaTuples in if statements",
		type: CompilerErrorType.LuaTupleInConditional,
	},
	"luaTupleInElseIf.spec.ts": {
		message: "should not allow LuaTuples in else if statements",
		type: CompilerErrorType.LuaTupleInConditional,
	},
	"reservedId.spec.ts": {
		message: "should not allow reserved identifiers to be used",
		type: CompilerErrorType.RobloxTSReservedIdentifier,
	},
	"invalidAccess.spec.server.ts": {
		message: "should not allow client only API to be accessed by server code",
		type: CompilerErrorType.InvalidClientOnlyAPIAccess,
	},
	"invalidAccess.spec.client.ts": {
		message: "should not allow server only API to be accessed by client code",
		type: CompilerErrorType.InvalidServerOnlyAPIAccess,
	},
	"equalsEquals.ts": {
		message: "should not allow ==",
		type: CompilerErrorType.NoEqualsEquals,
	},
	"exclamationEquals.ts": {
		message: "should not allow !=",
		type: CompilerErrorType.NoExclamationEquals,
	},
	"dynamicImport.spec.ts": {
		message: "should not allow dynamic imports",
		type: CompilerErrorType.NoDynamicImport,
	},
	"macroIndex.spec.ts": {
		message: "should not allowing indexing macro methods without call",
		type: CompilerErrorType.InvalidMacroIndex,
	},
	"classPrototype.spec.ts": {
		message: "should not allowing indexing class prototype",
		type: CompilerErrorType.NoClassPrototype,
	},
	"indexFunction.spec.ts": {
		message: "should not allowing indexing functions",
		type: CompilerErrorType.NoFunctionIndex,
	},
	"invalidMetamethod.spec.ts": {
		message: "should not allowing reserved metamethods",
		type: CompilerErrorType.UndefinableMetamethod,
	},
	"unexpectedInitializerForOf.spec.ts": {
		message: "should not allow expressions as initializers in for-of loops",
		type: CompilerErrorType.UnexpectedInitializer,
	},
	"disallowForIn.spec.ts": {
		message: "should not allow for-in loops",
		type: CompilerErrorType.ForInLoop,
	},
	"exportNonModule.spec.server.ts": {
		message: "should not allow exporting from a non-ModuleScript",
		type: CompilerErrorType.ExportInNonModuleScript,
	},
	"typeof.spec.ts": {
		message: "should not allow typeof operator",
		type: CompilerErrorType.NoTypeOf,
	},
	"any/index.spec.ts": {
		message: "should not allow indexing type any",
		type: CompilerErrorType.NoAny,
	},
	"any/call.spec.ts": {
		message: "should not allow calling type any",
		type: CompilerErrorType.NoAny,
	},
	"any/pass.spec.ts": {
		message: "should not allow passing type any",
		type: CompilerErrorType.NoAny,
	},
	"any/computedAccess.spec.ts": {
		message: "should not allow computed accessing type any",
		type: CompilerErrorType.NoAny,
	},
	"any/computedAccess2.spec.ts": {
		message: "should not allow computed accessing type any #2",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"any/func.spec.ts": {
		message: "should not allow functions that return type any",
		type: CompilerErrorType.NoAny,
	},
	"any/add.spec.ts": {
		message: "should not allow adding type any",
		type: CompilerErrorType.NoAny,
	},
	"any/sub.spec.ts": {
		message: "should not allow subtracting type any",
		type: CompilerErrorType.NoAny,
	},
	"any/mul.spec.ts": {
		message: "should not allow multiplying type any",
		type: CompilerErrorType.NoAny,
	},
	"any/div.spec.ts": {
		message: "should not allow dividing type any",
		type: CompilerErrorType.NoAny,
	},
	"any/unary.spec.ts": {
		message: "should not allow unary operators on type any",
		type: CompilerErrorType.NoAny,
	},
	"methodDestructure/arr.spec.1.ts": {
		message: "should not allow method indexing from arrays",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.2.ts": {
		message: "should not allow method indexing from arrays",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.3.ts": {
		message: "should not allow method indexing from arrays",
		type: CompilerErrorType.InvalidMacroIndex,
	},
	"methodDestructure/arr.spec.4.ts": {
		message: "should not allow method indexing from arrays",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.5.ts": {
		message: "should not allow method indexing from arrays",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/arr.spec.6.ts": {
		message: "should not allow method indexing from arrays",
		type: CompilerErrorType.BadDestructuringType,
	},
	"methodDestructure/arr.spec.7.ts": {
		message: "should not allow method indexing from arrays",
		type: CompilerErrorType.BadDestructuringType,
	},
	"methodDestructure/map.spec.1.ts": {
		message: "should not allow indexing from Maps",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/map.spec.2.ts": {
		message: "should not allow indexing from Maps",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"methodDestructure/union.spec.ts": {
		message: "should not allow Array and Object unions to be indexed from",
		type: CompilerErrorType.InvalidComputedIndex,
	},
	"tupleLength1.spec.ts": {
		message: "should not allow indexing the length property of tuples",
		type: CompilerErrorType.TupleLength,
	},
	"tupleLength2.spec.ts": {
		message: "should not allow indexing the length property of tuples",
		type: CompilerErrorType.TupleLength,
	},
	"tupleLength3.spec.ts": {
		message: "should not allow indexing the length property of tuples",
		type: CompilerErrorType.TupleLength,
	},
	"extendedMapClass.spec.ts": {
		message: "should not allow creating classes which extend Map",
		type: CompilerErrorType.BadClassExtends,
	},
	"extendedSetClass.spec.ts": {
		message: "should not allow creating classes which extend Set",
		type: CompilerErrorType.BadClassExtends,
	},
	"getters.spec.ts": {
		message: "should not allow getters",
		type: CompilerErrorType.GettersSettersDisallowed,
	},
	"setters.spec.ts": {
		message: "should not allow setters",
		type: CompilerErrorType.GettersSettersDisallowed,
	},
	"staticGetters.spec.ts": {
		message: "should not allow getters",
		type: CompilerErrorType.GettersSettersDisallowed,
	},
	"staticSetters.spec.ts": {
		message: "should not allow setters",
		type: CompilerErrorType.GettersSettersDisallowed,
	},
	"funcExpMethodCall.spec.ts": {
		message: "should not allow calling from function method expressions",
		type: CompilerErrorType.BadFunctionExpressionMethodCall,
	},
	"superCallback.spec.ts": {
		message: "should not allow super callback calls!",
		type: CompilerErrorType.BadSuperCall,
	},
	"extendArrayIterator.spec.ts": {
		message: "should not allow Symbol.iterator on classes which extend from Array",
		type: CompilerErrorType.DefaultIteratorOnArrayExtension,
	},
	"extendArrayIterator.spec.1.ts": {
		message: "should not allow Symbol.iterator on classes which extend from Array",
		type: CompilerErrorType.DefaultIteratorOnArrayExtension,
	},
	"extendArrayIterator.spec.2.ts": {
		message: "should not allow Symbol.iterator on classes which extend from Array",
		type: CompilerErrorType.DefaultIteratorOnArrayExtension,
	},
	"extendArrayIterator.spec.3.ts": {
		message: "should not allow Symbol.iterator on classes which extend from Array",
		type: CompilerErrorType.DefaultIteratorOnArrayExtension,
	},
	"computedMethodInClass.spec.ts": {
		message: "should not allow computed method names in classes",
		type: CompilerErrorType.ClassWithComputedMethodNames,
	},
	"requireGmatchForOfDestructure.spec.ts": {
		message: "should force destructuring on gmatch",
		type: CompilerErrorType.BadForOfInitializer,
	},
	"invalidNames/variableDeclaration.spec.ts": {
		message: "should not allow invalid identifiers to be used (variableDeclaration.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/destruct.spec.ts": {
		message: "should not allow invalid identifiers to be used (destruct.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/destructAlias.spec.ts": {
		message: "should not allow invalid identifiers to be used (destructAlias.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/function.spec.ts": {
		message: "should not allow invalid identifiers to be used (function.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/namespace.spec.ts": {
		message: "should not allow invalid identifiers to be used (namespace.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/functionExpression.spec.ts": {
		message: "should not allow invalid identifiers to be used (functionExpression.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/class.spec.ts": {
		message: "should not allow invalid identifiers to be used (class.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/arrDestruct.spec.ts": {
		message: "should not allow invalid identifiers to be used (arrDestruct.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/flatDestruct.spec.ts": {
		message: "should not allow invalid identifiers to be used (flatDestruct.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/enum.spec.ts": {
		message: "should not allow invalid identifiers to be used (enum.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"invalidNames/parameter.spec.ts": {
		message: "should not allow invalid identifiers to be used (parameter.spec.ts)",
		type: CompilerErrorType.InvalidIdentifier,
	},
	"method-callback/conflictingDefinitions.spec.ts": {
		message: "should not allow definition overloading of mixed methods/member functions",
		type: CompilerErrorType.MixedMethodCall,
	},
	"method-callback/conflictingClassMethods.spec.ts": {
		message: "should not allow definition clashing of mixed methods/member functions",
		type: CompilerErrorType.MixedMethodCall,
	},
	"method-callback/conflictingObjectMethodSet.spec.ts": {
		message: "should not allow definition changing of mixed methods/member functions",
		type: CompilerErrorType.MixedMethodSet,
	},
	"method-callback/conflictingVars.spec.ts": {
		message: "should not allow definition changing of mixed methods/member functions",
		type: CompilerErrorType.MixedMethodSet,
	},
	"noEnumMerging.spec.ts": {
		message: "should not allow enum merging",
		type: CompilerErrorType.NoEnumMerging,
	},
	"try.spec.ts": {
		message: "should not allow try statements",
		type: CompilerErrorType.NoTryStatement,
	},
};

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

function catchUnexpectedError(e: unknown, done: Mocha.Done) {
	if (e instanceof CompilerError) {
		done(`Unexpected CompilerError: ${CompilerErrorType[e.type]}`);
	} else if (e instanceof ProjectError) {
		done(`Unexpected ProjectError: ${ProjectErrorType[e.type]}`);
	} else if (e instanceof DiagnosticError) {
		done(`Unexpected DiagnosticError:\n${e.errors.join("\n")}`);
	} else {
		done(`Unexpected error: ${String(e)}`);
	}
}

describe("compile DiagnosticError unit tests", () => {
	it("should not allow diagnostic errors", done => {
		compile(path.join(srcFolder, "errors", DIAGNOSTIC_TEST_NAME))
			.then(() => done("Did not throw!"))
			.catch(e => {
				if (e instanceof DiagnosticError) {
					done();
				} else {
					catchUnexpectedError(e, done);
				}
			});
	});
});

describe("compile CompilerError unit tests", () => {
	for (const file in errorMatrix) {
		const errorInfo = errorMatrix[file];
		it(errorInfo.message, done => {
			compile(path.join(srcFolder, "errors", file))
				.then(() => done("Did not throw!"))
				.catch(e => {
					if (e instanceof CompilerError && errorInfo.type === e.type) {
						done();
					} else {
						catchUnexpectedError(e, done);
					}
				});
		});
	}
});
