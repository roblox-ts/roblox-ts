import ts from "byots";
import kleur from "kleur";

export type DiagnosticFactory = {
	(node: ts.Node): ts.DiagnosticWithLocation;
	id: number;
};

const REPO_URL = "https://github.com/roblox-ts/roblox-ts";

function suggestion(text: string) {
	return "Suggestion: " + kleur.yellow(text);
}

function issue(id: number) {
	return "More information: " + kleur.grey(`${REPO_URL}/issues/${id}`);
}

export function createDiagnosticWithLocation(id: number, message: string, node: ts.Node): ts.DiagnosticWithLocation {
	return {
		category: ts.DiagnosticCategory.Error,
		code: (" roblox-ts" as unknown) as number,
		file: node.getSourceFile(),
		messageText: message,
		start: node.getStart(),
		length: node.getWidth(),
		diagnosticType: 0,
		id,
	} as ts.DiagnosticWithLocation;
}

let id = 0;
/**
 * Returns a `DiagnosticFactory` that includes a function used to generate a readable message for the diagnostic.
 * @param messages The list of messages to include in the error report.
 */
function diagnostic(...messages: Array<string>): DiagnosticFactory {
	const result = (node: ts.Node) => {
		debugger;
		return createDiagnosticWithLocation(result.id, messages.join("\n"), node);
	};
	result.id = id++;
	return result;
}

export function getDiagnosticId(diagnostic: ts.Diagnostic): number {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (diagnostic as any).id;
}

/**
 * Defines diagnostic error messages
 */
export const diagnostics = {
	// reserved identifiers
	noReservedIdentifier: diagnostic(`Reserved Lua keywords cannot be used as identifiers!`),
	noClassMetamethods: diagnostic(`Metamethods cannot be used in class definitions!`),

	// banned statements
	noForInStatement: diagnostic(
		"for-in loop statements are not supported!",
		suggestion("Use for-of with `Object.keys()` instead."),
	),
	noLabeledStatement: diagnostic("labels are not supported!"),
	noDebuggerStatement: diagnostic("`debugger` is not supported!"),

	// banned expressions
	noDeleteExpression: diagnostic(
		"The `delete` operator is not supported!",
		suggestion("Set the property to `undefined` instead."),
		issue(547),
	),
	noNullLiteral: diagnostic("`null` is not supported!", suggestion("Use `undefined` instead.")),
	noPrivateIdentifier: diagnostic("Private identifiers are not supported!"),
	noTypeOfExpression: diagnostic(
		"`typeof` operator is not supported!",
		suggestion("Use `typeIs(value, type)` or `typeOf(value)` instead."),
	),
	noRegex: diagnostic("Regular expressions are not supported!"),

	// banned features
	noAny: diagnostic("Using values of type `any` is not supported!", suggestion("Use `unknown` instead.")),
	noVar: diagnostic("`var` keyword is not supported!", suggestion("Use `let` or `const` instead.")),
	noGetterSetter: diagnostic("Getters and Setters are not supported!", issue(457)),
	noEqualsEquals: diagnostic("operator `==` is not supported!", suggestion("Use `===` instead.")),
	noExclamationEquals: diagnostic("operator `!=` is not supported!", suggestion("Use `!==` instead.")),
	noComma: diagnostic("operator `,` is not supported!"),
	noEnumMerging: diagnostic("Enum merging is not supported!"),
	noNamespaceMerging: diagnostic("Namespace merging is not supported!"),
	noSpreadDestructuring: diagnostic("Operator `...` is not supported for destructuring!"),
	noFunctionExpressionName: diagnostic("Function expression names are not supported!"),
	noPrecedingSpreadElement: diagnostic("Spread element must come last in a list of arguments!"),
	noDestructureAssignmentExpression: diagnostic(
		"Cannot destructure LuaTuple<T> expression outside of an ExpressionStatement!",
	),
	noExportAssignmentLet: diagnostic("Cannot use `export =` on a `let` variable!", suggestion("Use `const` instead.")),
	noExportLetAlias: diagnostic("Exports defined with `let` cannot use aliases!"),
	noGlobalThis: diagnostic("`globalThis` is not supported!"),
	noArguments: diagnostic("`arguments` is not supported!"),
	noPrototype: diagnostic("`prototype` is not supported!"),
	noSuperProperty: diagnostic("super properties are not supported!"),
	noNonNumberStringRelationOperator: diagnostic("Relation operators can only be used on number or string types!"),
	noInstanceMethodCollisions: diagnostic("Static methods cannot use the same name as instance methods!"),
	noStaticMethodCollisions: diagnostic("Instance methods cannot use the same name as static methods!"),
	noUnaryPlus: diagnostic("Unary `+` is not supported!", suggestion("Use `tonumber(x)` instead.")),
	noLuaTupleIterationWithoutDestructure: diagnostic("IterableFunction<LuaTuple<T>> must be destructured in-line!"),
	noAwaitForOf: diagnostic("`await` is not supported in for-of loops!"),

	// macro methods
	noOptionalMacroCall: diagnostic("Macro methods can not be optionally called!"),
	noMixedTypeCall: diagnostic(
		"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
	),
	noIndexWithoutCall: diagnostic(
		"Cannot index a method without calling it!",
		suggestion("Use the form `() => a.b()` instead of `a.b`."),
	),
	noMacroWithoutCall: diagnostic(
		"Cannot index a macro without calling it!",
		suggestion("Use the form `() => a.b()` instead of `a.b`."),
	),
	noConstructorMacroWithoutNew: diagnostic("Cannot index a constructor macro without using the `new` operator!"),
	noMacroExtends: diagnostic("Cannot extend from a macro class!"),

	// import/export
	noNonModule: diagnostic(
		"File does not have an import or export statement!",
		suggestion("Add `export {};` as the first line."),
		issue(1043),
	),
	noModuleSpecifierFile: diagnostic("Could not find file for import. Did you forget to `npm install`?"),
	noRojoData: diagnostic("Could not find Rojo data"),
	noNonModuleImport: diagnostic("Cannot import a non-ModuleScript!"),
	noIsolatedImport: diagnostic("Attempted to import a file inside of an isolated container from outside!"),

	// roact jsx
	noRoactInheritance: diagnostic(
		"Composition is preferred over inheritance with Roact components.",
		"More info: https://reactjs.org/docs/composition-vs-inheritance.html",
	),
	noSuperPropertyCallRoactComponent: diagnostic("`super` is not supported inside Roact components!"),
	noSuperConstructorRoactComponent: diagnostic(
		"`super(props)` must be the first statement of the constructor in a Roact component!",
	),
	noJsxText: diagnostic("JSX text is not supported!"),
};
