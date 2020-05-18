import ts from "byots";
import { TransformState } from "TSTransformer";
import { assert } from "Shared/util/assert";
import { diagnostics } from "Shared/diagnostics";

export function transformJsx(
	state: TransformState,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children: ReadonlyArray<ts.JsxChild>,
) {
	tagName; // Identifier | ThisExpression | JsxTagNamePropertyAccess

	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			attribute.name; // ts.Identifier
			attribute.initializer; // ts.JsxExpression | ts.StringLiteral | undefined
		} else {
			attribute.expression; // ts.Expression
		}
	}

	for (const child of children) {
		if (ts.isJsxText(child)) {
			if (!child.containsOnlyTriviaWhiteSpaces) {
				state.addDiagnostic(diagnostics.noJsxText(child));
			}
			continue;
		}

		// not available when jsxFactory is set
		assert(!ts.isJsxFragment(child));

		if (ts.isJsxExpression(child)) {
			child.dotDotDotToken; // ts.Token<ts.SyntaxKind.DotDotDotToken> | undefined
			child.expression; // ts.Expression | undefined
		} else {
			child; // ts.JsxElement | ts.JsxSelfClosingElement
		}
	}
}
