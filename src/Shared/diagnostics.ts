import ts from "byots";
import kleur from "kleur";
import { createDiagnosticWithLocation } from "Shared/util/createDiagnosticWithLocation";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";

export type DiagnosticFactory<T = void> = {
	(node: ts.Node, context: T): ts.DiagnosticWithLocation;
	id: number;
};

type DiagnosticContextFormatter<T> = (ctx: T) => Array<string>;

const REPO_URL = "https://github.com/roblox-ts/roblox-ts";

function suggestion(text: string) {
	return "Suggestion: " + kleur.yellow(text);
}

function issue(id: number) {
	return "More information: " + kleur.grey(`${REPO_URL}/issues/${id}`);
}

let id = 0;

/**
 * Returns a `DiagnosticFactory` that includes a function used to generate a readable message for the diagnostic.
 * @param messages The list of messages to include in the error report.
 */
function diagnostic(category: ts.DiagnosticCategory, code: number, ...messages: Array<string>): DiagnosticFactory {
	return diagnosticWithContext<void>(category, code, undefined, ...messages);
}

/**
 * Returns a `DiagnosticFactory` that includes a function used to generate a readable message for the diagnostic.
 * The context is additonal data from the location where the diagnostic occurred that is used to generate dynamic
 * messages.
 * @param contextFormatter An optional function to format the context parameter for this diagnostic. The returned
 * formatted messages are displayed last in the diagnostic report.
 * @param messages The list of messages to include in the diagnostic report.
 */
function diagnosticWithContext<T>(
	category: ts.DiagnosticCategory,
	code: number,
	contextFormatter?: DiagnosticContextFormatter<T>,
	...messages: Array<string>
): DiagnosticFactory<T> {
	const result = (node: ts.Node, context: T) => {
		if (category === ts.DiagnosticCategory.Error) {
			debugger;
		}

		if (contextFormatter) {
			messages.push(...contextFormatter(context));
		}

		return createDiagnosticWithLocation(result.id, code, messages.join("\n"), category, node);
	};
	result.id = id++;
	return result;
}

function diagnosticText(category: ts.DiagnosticCategory, code: number, ...messages: Array<string>) {
	return createTextDiagnostic(code, messages.join("\n"), category);
}

function error(code: number, ...messages: Array<string>): DiagnosticFactory {
	return diagnostic(ts.DiagnosticCategory.Error, code, ...messages);
}

function errorWithContext<T>(
	code: number,
	contextFormatter: DiagnosticContextFormatter<T>,
	...messages: Array<string>
): DiagnosticFactory<T> {
	return diagnosticWithContext(ts.DiagnosticCategory.Error, code, contextFormatter, ...messages);
}

function warning(code: number, ...messages: Array<string>): DiagnosticFactory {
	return diagnostic(ts.DiagnosticCategory.Warning, code, ...messages);
}

function warningText(code: number, ...messages: Array<string>) {
	return diagnosticText(ts.DiagnosticCategory.Warning, code, ...messages);
}

export function getDiagnosticId(diagnostic: ts.Diagnostic): number {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (diagnostic as any).id;
}

/*
	Diagnostic Ranges
	1-29: reserved identifiers
	30-59: banned statements
	60-99: banned expressions
	100-199: banned features
	200-299: macros
	300-399: import-export
	400-499: JSX

	600-699: Error classes (ProjectError, CLIError)
	600: ProjectError
	601: CLIError
	602: compileFiles error

	700-799: warnings
*/
/**
 * Defines diagnostic error messages
 */
export const errors = {
	// reserved identifiers
	noInvalidIdentifier: error(
		1,
		"Invalid Luau identifier!",
		"Luau identifiers must start with a letter and only contain letters, numbers, and underscores.",
		"Reserved Luau keywords cannot be used as identifiers.",
	),
	noReservedIdentifier: error(2, "Cannot use identifier reserved for compiler internal usage."),
	noReservedClassFields: error(3, "Cannot use class field reserved for compiler internal usage."),
	noClassMetamethods: error(4, "Metamethods cannot be used in class definitions!"),

	// banned statements
	noForInStatement: error(30, "for-in loop statements are not supported!"),
	noLabeledStatement: error(31, "labels are not supported!"),
	noDebuggerStatement: error(32, "`debugger` is not supported!"),

	// banned expressions
	noNullLiteral: error(60, "`null` is not supported!", suggestion("Use `undefined` instead.")),
	noPrivateIdentifier: error(61, "Private identifiers are not supported!"),
	noTypeOfExpression: error(
		62,
		"`typeof` operator is not supported!",
		suggestion("Use `typeIs(value, type)` or `typeOf(value)` instead."),
	),
	noRegex: error(63, "Regular expressions are not supported!"),
	noBigInt: error(64, "BigInt literals are not supported!"),

	// banned features
	noAny: error(100, "Using values of type `any` is not supported!", suggestion("Use `unknown` instead.")),
	noVar: error(101, "`var` keyword is not supported!", suggestion("Use `let` or `const` instead.")),
	noGetterSetter: error(102, "Getters and Setters are not supported!", issue(457)),
	noEqualsEquals: error(103, "operator `==` is not supported!", suggestion("Use `===` instead.")),
	noExclamationEquals: error(104, "operator `!=` is not supported!", suggestion("Use `!==` instead.")),
	noComma: error(105, "operator `,` is not supported!"),
	noEnumMerging: error(106, "Enum merging is not supported!"),
	noNamespaceMerging: error(107, "Namespace merging is not supported!"),
	noSpreadDestructuring: error(108, "Operator `...` is not supported for destructuring!"),
	noFunctionExpressionName: error(109, "Function expression names are not supported!"),
	noPrecedingSpreadElement: error(110, "Spread element must come last in a list of arguments!"),
	noDestructureAssignmentExpression: error(
		111,
		"Cannot destructure LuaTuple<T> expression outside of an ExpressionStatement!",
	),
	noExportAssignmentLet: error(112, "Cannot use `export =` on a `let` variable!", suggestion("Use `const` instead.")),
	noGlobalThis: error(113, "`globalThis` is not supported!"),
	noArguments: error(114, "`arguments` is not supported!"),
	noPrototype: error(115, "`prototype` is not supported!"),
	noSuperProperty: error(116, "`super` properties are not supported!"),
	noNonNumberStringRelationOperator: error(117, "Relation operators can only be used on number or string types!"),
	noInstanceMethodCollisions: error(118, "Static methods cannot use the same name as instance methods!"),
	noStaticMethodCollisions: error(119, "Instance methods cannot use the same name as static methods!"),
	noUnaryPlus: error(120, "Unary `+` is not supported!", suggestion("Use `tonumber(x)` instead.")),
	noNonNumberUnaryMinus: error(121, "Unary `-` is only supported for number types!"),
	noAwaitForOf: error(122, "`await` is not supported in for-of loops!"),
	noComplexForOf: error(123, "for-of loops do not support complex variable lists!", issue(1253)),
	noAsyncGeneratorFunctions: error(124, "Async generator functions are not supported!"),
	noNonStringModuleSpecifier: error(125, "Module specifiers must be a string literal."),
	noIterableIteration: error(126, "Iterating on Iterable<T> is not supported! You must use a more specific type."),

	// macro methods
	noOptionalMacroCall: error(200, "Macro methods can not be optionally called!"),
	noMixedTypeCall: error(
		201,
		"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
	),
	noIndexWithoutCall: error(
		202,
		"Cannot index a method without calling it!",
		suggestion("Use the form `() => a.b()` instead of `a.b`."),
	),
	noMacroWithoutCall: error(
		203,
		"Cannot index a macro without calling it!",
		suggestion("Use the form `() => a.b()` instead of `a.b`."),
	),
	noObjectWithoutMethod: error(204, "Cannot access `Object` without calling a function on it!"),
	noConstructorMacroWithoutNew: error(205, "Cannot index a constructor macro without using the `new` operator!"),
	noMacroExtends: error(206, "Cannot extend from a macro class!"),
	noMacroUnion: error(207, "Macro cannot be applied to a union type!"),
	noMacroObjectSpread: error(
		208,
		"Macro classes cannot be used in an object spread!",
		suggestion("Did you mean to use an array spread? `[ ...exp ]`"),
	),
	noVarArgsMacroSpread: error(
		209,
		"Macros which use variadric arguments do not support spread expressions!",
		issue(1149),
	),

	// import/export
	noNonModule: error(
		300,
		"File does not have an import or export statement!",
		suggestion("Add `export {};` as the first line."),
		issue(1043),
	),
	noModuleSpecifierFile: error(301, "Could not find file for import. Did you forget to `npm install`?"),
	noRojoData: errorWithContext(302, (path: string) => [
		`Could not find Rojo data. There is no $path in your Rojo config that covers ${path}`,
	]),
	noNonModuleImport: error(303, "Cannot import a non-ModuleScript!"),
	noIsolatedImport: error(304, "Attempted to import a file inside of an isolated container from outside!"),

	// roact jsx
	noRoactInheritance: error(
		305,
		"Composition is preferred over inheritance with Roact components.",
		"More info: https://reactjs.org/docs/composition-vs-inheritance.html",
	),
	noSuperPropertyCallRoactComponent: error(306, "`super` is not supported inside Roact components!"),
	noSuperConstructorRoactComponent: error(
		307,
		"`super(props)` must be the first statement of the constructor in a Roact component!",
	),
	// Never actually thrown, already a TypeError
	noJsxText: error(308, "JSX text is not supported!"),
};

export const warnings = {
	truthyChange: (checksStr: string) => warning(700, `value will be checked against ${checksStr}`),
	stringOffsetChange: (text: string) => warning(701, `String macros no longer offset inputs: ${text}`),
	rojoPathInSrc: (partitionPath: string, suggestedPath: string) =>
		warningText(
			702,
			`Invalid Rojo configuration. $path fields should be relative to out directory.`,
			suggestion(`Change the value of $path from "${partitionPath}" to "${suggestedPath}".`),
		),
	runtimeLibUsedInReplicatedFirst: warning(
		703,
		"This statement would generate a call to the runtime library. The runtime library should not be used from ReplicatedFirst.",
	),
};
