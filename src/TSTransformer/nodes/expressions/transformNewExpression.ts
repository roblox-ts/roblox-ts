import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getFirstConstructSymbol } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformNewExpression(state: TransformState, prereqs: Prereqs, node: ts.NewExpression) {
	validateNotAnyType(state, node.expression);

	const symbol = getFirstConstructSymbol(state, node.expression);
	if (symbol) {
		const macro = state.services.macroManager.getConstructorMacro(symbol);
		if (macro) {
			return macro(state, prereqs, node);
		}
	}

	const expression = convertToIndexableExpression(transformExpression(state, prereqs, node.expression));
	const args = node.arguments ? ensureTransformOrder(state, prereqs, node.arguments) : [];
	return luau.call(luau.property(expression, "new"), args);
}
