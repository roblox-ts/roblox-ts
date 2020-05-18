import ts from "byots";
import { TransformState } from "TSTransformer";
import { assert } from "Shared/util/assert";
import { diagnostics } from "Shared/diagnostics";

export function transformJsx(
	state: TransformState,
	attributes: ts.JsxAttributes,
	children: ReadonlyArray<ts.JsxChild>,
) {
	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			attribute.name;
			attribute.initializer;
		} else {
			attribute.expression;
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
			child.dotDotDotToken;
			child.expression;
		} else {
			child;
		}
	}
}
