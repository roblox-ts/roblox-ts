import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

// hack for now until we can detect arrays
export function addOneIfNumber(expression: lua.Expression) {
	if (lua.isNumberLiteral(expression)) {
		expression.value++;
	}
	return expression;
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	const [expression, index] = ensureTransformOrder(state, [
		() => transformExpression(state, node.expression),
		() => transformExpression(state, node.argumentExpression),
	]);

	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfNumber(index),
	});
}
