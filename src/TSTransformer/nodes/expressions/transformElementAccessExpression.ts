import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { createQuestionDotStatements } from "TSTransformer/util/createQuestionDotStatements";

// hack for now until we can detect arrays
export function addOneIfNumber(expression: lua.Expression) {
	if (lua.isNumberLiteral(expression)) {
		return lua.create(lua.SyntaxKind.NumberLiteral, {
			value: expression.value + 1,
		});
	}
	return expression;
}

function createElementAccessExpressionInner(expression: lua.Expression, index: lua.Expression) {
	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfNumber(index),
	});
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	if (node.questionDotToken) {
		const expression = transformExpression(state, node.expression);
		return createQuestionDotStatements(state, expression, id =>
			createElementAccessExpressionInner(id, transformExpression(state, node.argumentExpression)),
		);
	}

	const [expression, index] = ensureTransformOrder(state, [node.expression, node.argumentExpression]);
	return createElementAccessExpressionInner(expression, index);
}
