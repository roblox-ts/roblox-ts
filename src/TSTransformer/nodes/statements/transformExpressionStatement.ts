import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	transformWritableAssignmentWithType,
	transformWritableExpressionWithType,
} from "TSTransformer/nodes/transformWritable";
import { isUnaryAssignmentOperator } from "TSTransformer/typeGuards";
import { createAssignmentStatement, createCompoundAssignmentStatement } from "TSTransformer/util/assignment";
import { createNodeWithType } from "TSTransformer/util/createNodeWithType";
import { skipDownwards } from "TSTransformer/util/traversal";

function transformUnaryExpressionStatement(
	state: TransformState,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	const writable = transformWritableExpressionWithType(state, node.operand, true);
	return createCompoundAssignmentStatement(
		state,
		writable,
		writable,
		node.operator,
		createNodeWithType(lua.number(1)),
	);
}

export function transformExpressionStatementInner(state: TransformState, expression: ts.Expression) {
	if (ts.isBinaryExpression(expression)) {
		const operator = expression.operatorToken.kind;
		if (
			ts.isAssignmentOperator(operator) &&
			!ts.isArrayLiteralExpression(expression.left) &&
			!ts.isObjectLiteralExpression(expression.left)
		) {
			const { writable, readable, value } = transformWritableAssignmentWithType(
				state,
				expression.left,
				expression.right,
				ts.isCompoundAssignment(operator),
			);
			if (ts.isCompoundAssignment(operator)) {
				return lua.list.make(createCompoundAssignmentStatement(state, writable, readable, operator, value));
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
	if (lua.isCall(transformed)) {
		return lua.list.make(lua.create(lua.SyntaxKind.CallStatement, { expression: transformed }));
	} else if (lua.isAnyIdentifier(transformed) || lua.isNilLiteral(transformed)) {
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

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = skipDownwards(node.expression);
	return transformExpressionStatementInner(state, expression);
}
