import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";
import { createQuestionDotStatements } from "TSTransformer/util/createQuestionDotStatements";

export function transformPropertyAccessExpression(state: TransformState, node: ts.PropertyAccessExpression) {
	const expression = convertToIndexableExpression(transformExpression(state, node.expression));

	if (node.questionDotToken) {
		return createQuestionDotStatements(state, expression, id =>
			lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: id,
				name: node.name.text,
			}),
		);
	}

	return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
		expression,
		name: node.name.text,
	});
}
