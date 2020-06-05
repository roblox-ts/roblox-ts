import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getFirstConstructSymbol } from "TSTransformer/util/getFirstConstructSymbol";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformNewExpression(state: TransformState, node: ts.NewExpression) {
	validateNotAnyType(state, node.expression);

	const symbol = getFirstConstructSymbol(state, node.expression);
	if (symbol) {
		const macro = state.macroManager.getConstructorMacro(symbol);
		if (macro) {
			return macro(state, node);
		}
	}

	const expression = convertToIndexableExpression(transformExpression(state, node.expression));
	const args = node.arguments
		? lua.list.make(...ensureTransformOrder(state, node.arguments))
		: lua.list.make<lua.Expression>();
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression,
			name: "new",
		}),
		args,
	});
}
