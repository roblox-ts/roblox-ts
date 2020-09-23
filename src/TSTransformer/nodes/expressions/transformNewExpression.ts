import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getFirstConstructSymbol } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformNewExpression(state: TransformState, node: ts.NewExpression) {
	validateNotAnyType(state, node.expression);

	const symbol = getFirstConstructSymbol(state, node.expression);
	if (symbol) {
		const macro = state.services.macroManager.getConstructorMacro(symbol);
		if (macro) {
			return macro(state, node);
		}
	}

	const expression = convertToIndexableExpression(transformExpression(state, node.expression));
	const args = node.arguments
		? luau.list.make(...ensureTransformOrder(state, node.arguments))
		: luau.list.make<luau.Expression>();
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression,
			name: "new",
		}),
		args,
	});
}
