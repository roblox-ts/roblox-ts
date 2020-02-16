import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createQuestionDotStatements } from "TSTransformer/util/createQuestionDotStatements";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";

function transformCallExpressionInner(
	state: TransformState,
	expression: lua.IndexableExpression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const args = lua.list.make(...ensureTransformOrder(state, nodeArguments));
	return lua.create(lua.SyntaxKind.CallExpression, { expression, args });
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	const expression = convertToIndexableExpression(transformExpression(state, node.expression));

	if (node.questionDotToken) {
		return createQuestionDotStatements(state, expression, id =>
			transformCallExpressionInner(state, id, node.arguments),
		);
	}

	return transformCallExpressionInner(state, expression, node.arguments);
}
