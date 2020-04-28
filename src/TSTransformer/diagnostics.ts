import ts from "byots";
import { createDiagnosticWithLocation } from "TSTransformer/util/createDiagnosticWithLocation";
import chalk from "chalk";

export type DiagnosticFactory = (node: ts.Node) => ts.Diagnostic;

// force colors
chalk.level = chalk.Level.Basic;

const REPO_URL = "https://github.com/roblox-ts/roblox-ts";

function suggestion(text: string) {
	return "Suggestion: " + chalk.yellowBright(text);
}

function issue(id: number) {
	return "More information: " + chalk.grey(`${REPO_URL}/issues/${id}`);
}

function diagnostic(...messages: Array<string>): DiagnosticFactory {
	return (node: ts.Node) => createDiagnosticWithLocation(messages.join("\n"), node);
}

export const diagnostics = {
	// banned statements
	noTryStatement: diagnostic("try-catch statements are not supported!", issue(873)),
	noForInStatement: diagnostic("for-in loop statements are not supported!"),
	noLabeledStatement: diagnostic("labels are not supported!"),
	noDebuggerStatement: diagnostic("`debugger` is not supported!"),

	// banned expressions
	noNullLiteral: diagnostic("`null` is not supported!", suggestion("Use `undefined` instead.")),
	noTypeOfExpression: diagnostic(
		"`typeof` operator is not supported!",
		suggestion("Use `typeIs(value, type)` or `typeOf(value)` instead."),
	),

	// banned features
	noGetterSetter: diagnostic("Getters and Setters are not supported!", issue(457)),
	noEqualsEquals: diagnostic("operator '==' is not supported!", suggestion("Use `===` instead.")),
	noExclamationEquals: diagnostic("operator '!=' is not supported!", suggestion("Use `!==` instead.")),

	// macro methods
	noOptionalMacroCall: diagnostic("Macro methods can not be optionally called!"),
	noMixedTypeCall: diagnostic(
		"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
	),
	noIndexWithoutCall: diagnostic(
		"Cannot index a method without calling it!",
		suggestion("Use the form `() => a.b()` instead of `a.b`."),
	),
};
