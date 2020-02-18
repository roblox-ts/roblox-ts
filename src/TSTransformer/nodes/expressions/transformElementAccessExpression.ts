import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { debugOptionalChain } from "TSTransformer/util/optionalChain";

// hack for now until we can detect arrays
export function addOneIfNumber(expression: lua.Expression) {
	if (lua.isNumberLiteral(expression)) {
		return lua.create(lua.SyntaxKind.NumberLiteral, {
			value: expression.value + 1,
		});
	}
	return expression;
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	debugOptionalChain(state, node);
	return lua.tempId();

	const [expression, index] = ensureTransformOrder(state, [node.expression, node.argumentExpression]);
	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfNumber(index),
	});
}
