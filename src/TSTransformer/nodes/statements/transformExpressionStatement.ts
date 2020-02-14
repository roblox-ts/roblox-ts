import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	createCompoundAssignmentStatement,
	isCompoundAssignmentOperator,
	isUnaryAssignmentOperator,
	isAssignmentOperator,
	createAssignmentStatement,
} from "TSTransformer/util/assignment";
import { transformWritableExpression, transformWritableAssignment } from "TSTransformer/util/transformWritable";
import ts from "typescript";

function transformUnaryExpressionStatement(
	state: TransformState,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return createCompoundAssignmentStatement(
		transformWritableExpression(state, node.operand),
		node.operator,
		lua.number(1),
	);
}

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = node.expression;
	if (ts.isBinaryExpression(expression)) {
		const operator = expression.operatorToken.kind;
		if (isAssignmentOperator(operator)) {
			const { writable, value } = transformWritableAssignment(state, expression.left, expression.right);
			if (isCompoundAssignmentOperator(operator)) {
				return lua.list.make(createCompoundAssignmentStatement(writable, operator, value));
			} else {
				return lua.list.make(createAssignmentStatement(writable, value));
			}
		}
	} else if (
		(ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) &&
		isUnaryAssignmentOperator(expression.operator)
	) {
		return lua.list.make(transformUnaryExpressionStatement(state, expression));
	}

	const transformed = transformExpression(state, expression);
	if (lua.isCallExpression(transformed) || lua.isMethodCallExpression(transformed)) {
		return lua.list.make(lua.create(lua.SyntaxKind.CallStatement, { expression: transformed }));
	} else {
		return lua.list.make(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.emptyId(),
				right: transformed,
			}),
		);
	}
}
