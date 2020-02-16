import ts from "typescript";
import { createDiagnosticWithLocation } from "TSTransformer/util/createDiagnosticWithLocation";

const REPO_URL = "https://github.com/roblox-ts/roblox-ts";

function issue(id: number) {
	return `${REPO_URL}/issues/${id}`;
}

function diagnostic(...messages: Array<string>) {
	return (node: ts.Node) => createDiagnosticWithLocation(messages.join("\n"), node);
}

export namespace diagnostics {
	// banned statements
	export const noTryStatement = diagnostic(`try-catch statements are not allowed!`, `See ${issue(873)}`);
	export const noForInStatement = diagnostic("for-in loop statements are not allowed!");
	export const noLabeledStatement = diagnostic("labels are not allowed!");

	// banned expressions
	export const noNullLiteral = diagnostic("`null` is not allowed!");
	export const noTypeOfExpression = diagnostic(
		"'typeof' operator is not supported!",
		"Use `typeIs(value, type)` or `typeOf(value)` instead.",
	);

	// banned features
}
