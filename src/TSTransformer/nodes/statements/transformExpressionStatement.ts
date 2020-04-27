import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	createAssignmentStatement,
	createCompoundAssignmentStatement,
	isAssignmentOperator,
	isCompoundAssignmentOperator,
	isUnaryAssignmentOperator,
} from "TSTransformer/util/assignment";
import { createNodeWithType } from "TSTransformer/util/createNodeWithType";
import {
	transformWritableAssignmentWithType,
	transformWritableExpressionWithType,
} from "TSTransformer/util/transformWritable";
import ts from "typescript";

function transformUnaryExpressionStatement(
	state: TransformState,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return createCompoundAssignmentStatement(
		transformWritableExpressionWithType(state, node.operand),
		node.operator,
		createNodeWithType(lua.number(1)),
	);
}

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = node.expression;
	if (ts.isBinaryExpression(expression)) {
		const operator = expression.operatorToken.kind;
		if (isAssignmentOperator(operator)) {
			const { writable, value } = transformWritableAssignmentWithType(state, expression.left, expression.right);
			if (isCompoundAssignmentOperator(operator)) {
				return lua.list.make(createCompoundAssignmentStatement(writable, operator, value));
			} else {
				return lua.list.make(createAssignmentStatement(writable.node, value.node));
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
	} else if (lua.isAnyIdentifier(transformed)) {
		return lua.list.make<lua.Statement>();
	} else {
		return lua.list.make(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.emptyId(),
				right: transformed,
			}),
		);
	}
}
