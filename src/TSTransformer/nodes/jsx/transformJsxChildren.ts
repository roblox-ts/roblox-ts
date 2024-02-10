import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { findLastIndex } from "Shared/util/findLastIndex";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { fixupWhitespaceAndDecodeEntities } from "TSTransformer/util/fixupWhitespaceAndDecodeEntities";
import ts from "typescript";

export function transformJsxChildren(state: TransformState, children: ReadonlyArray<ts.JsxChild>) {
	const lastJsxChildIndex = findLastIndex(
		children,
		child => !ts.isJsxText(child) || !child.containsOnlyTriviaWhiteSpaces,
	);

	for (let i = 0; i < lastJsxChildIndex; i++) {
		const child = children[i];
		if (ts.isJsxExpression(child) && child.dotDotDotToken) {
			DiagnosticService.addDiagnostic(errors.noPrecedingJsxSpreadElement(child));
		}
	}

	return ensureTransformOrder(
		state,
		children
			// ignore jsx text that only contains whitespace
			.filter(v => !ts.isJsxText(v) || !v.containsOnlyTriviaWhiteSpaces)
			// ignore empty jsx expressions, i.e. `{}`
			.filter(v => !ts.isJsxExpression(v) || v.expression !== undefined),
		(state, node) => {
			if (ts.isJsxText(node)) {
				const text = fixupWhitespaceAndDecodeEntities(node.text) ?? "";
				return luau.string(text.replace(/\\/g, "\\\\"));
			}
			return transformExpression(state, node);
		},
	);
}
