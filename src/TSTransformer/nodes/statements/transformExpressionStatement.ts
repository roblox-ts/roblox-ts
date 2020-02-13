import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	getCompoundAssignmentStatement,
	isCompoundAssignmentOperator,
	isUnaryAssignmentOperator,
	isAssignmentOperator,
	getAssignmentStatement,
} from "TSTransformer/util/assignment";
import { getWritableExpression } from "TSTransformer/util/getWritableExpression";
import ts from "typescript";

function transformAssignmentStatement(state: TransformState, node: ts.BinaryExpression) {
	return getAssignmentStatement(getWritableExpression(state, node.left), transformExpression(state, node.right));
}

function transformCompoundAssignmentStatement(state: TransformState, node: ts.BinaryExpression) {
	return getCompoundAssignmentStatement(
		getWritableExpression(state, node.left),
		node.operatorToken.kind,
		transformExpression(state, node.right),
	);
}

function transformUnaryExpressionStatement(
	state: TransformState,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return getCompoundAssignmentStatement(getWritableExpression(state, node.operand), node.operator, lua.number(1));
}

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = node.expression;
	if (ts.isBinaryExpression(expression)) {
		const operator = expression.operatorToken.kind;
		if (isAssignmentOperator(operator)) {
			if (isCompoundAssignmentOperator(operator)) {
				return lua.list.make(transformCompoundAssignmentStatement(state, expression));
			} else {
				return lua.list.make(transformAssignmentStatement(state, expression));
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
