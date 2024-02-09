import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { fixupWhitespaceAndDecodeEntities } from "TSTransformer/util/fixupWhitespaceAndDecodeEntities";
import ts from "typescript";

export function transformJsxChildren(state: TransformState, children: ReadonlyArray<ts.JsxChild>) {
	return ensureTransformOrder(
		state,
		children
			// ignore jsx text that only contains whitespace
			.filter(v => !ts.isJsxText(v) || !v.containsOnlyTriviaWhiteSpaces)
			// ignore empty jsx expressions, i.e. `{}`
			.filter(v => !ts.isJsxExpression(v) || v.expression !== undefined),
		(state, node) => {
			if (ts.isJsxText(node)) {
				return luau.string(fixupWhitespaceAndDecodeEntities(node.text) ?? "");
			}
			return transformExpression(state, node);
		},
	);
}
