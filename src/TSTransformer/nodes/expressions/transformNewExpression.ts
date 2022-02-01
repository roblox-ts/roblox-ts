import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getFirstConstructSymbol } from "TSTransformer/util/types";
import ts from "typescript";

export function transformNewExpression(state: TransformState, node: ts.NewExpression) {
	const symbol = getFirstConstructSymbol(state, node.expression);
	if (symbol) {
		const macro = state.services.macroManager.getConstructorMacro(symbol);
		if (macro) {
			return macro(state, node);
		}
	}

	const expression = convertToIndexableExpression(transformExpression(state, node.expression));
	const args = node.arguments ? ensureTransformOrder(state, node.arguments) : [];
	return luau.call(luau.property(expression, "new"), args);
}
