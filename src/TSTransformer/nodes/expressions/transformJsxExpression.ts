import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformJsxExpression(state: TransformState, node: ts.JsxExpression) {
	if (node.expression) {
		const expression = transformExpression(state, node.expression);
		if (node.dotDotDotToken) {
			return luau.call(luau.globals.unpack, [expression]);
		}
		return expression;
	}
	return luau.none();
}
