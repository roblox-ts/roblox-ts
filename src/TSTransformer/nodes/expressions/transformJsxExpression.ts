import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformJsxExpression(state: TransformState, prereqs: Prereqs, node: ts.JsxExpression) {
	if (node.expression) {
		const expression = transformExpression(state, prereqs, node.expression);
		if (node.dotDotDotToken) {
			return luau.call(luau.globals.unpack, [expression]);
		}
		return expression;
	}
	return luau.none();
}
