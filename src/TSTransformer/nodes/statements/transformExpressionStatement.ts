import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformLogicalOrCoalescingAssignmentExpressionStatement } from "TSTransformer/nodes/transformLogicalOrCoalescingAssignmentExpression";
import { transformWritableAssignment, transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { isUnaryAssignmentOperator } from "TSTransformer/typeGuards";
import { createCompoundAssignmentStatement, getSimpleAssignmentOperator } from "TSTransformer/util/assignment";
import { getAssignableValue } from "TSTransformer/util/getAssignableValue";
import { skipDownwards } from "TSTransformer/util/traversal";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

function transformUnaryExpressionStatement(
	state: TransformState,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	const writable = transformWritableExpression(state, node.operand, false);
	const operator: luau.AssignmentOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=";
	return luau.create(luau.SyntaxKind.Assignment, {
		left: writable,
		operator,
		right: luau.number(1),
	});
}

export function transformExpressionStatementInner(
	state: TransformState,
	expression: ts.Expression,
): luau.List<luau.Statement> {
	if (ts.isBinaryExpression(expression)) {
		const operatorKind = expression.operatorToken.kind;
		if (ts.isLogicalOrCoalescingAssignmentExpression(expression)) {
			return transformLogicalOrCoalescingAssignmentExpressionStatement(state, expression);
		} else if (
			ts.isAssignmentOperator(operatorKind) &&
			!ts.isArrayLiteralExpression(expression.left) &&
			!ts.isObjectLiteralExpression(expression.left)
		) {
			const writableType = state.getType(expression.left);
			const valueType = state.getType(expression.right);
			const operator = getSimpleAssignmentOperator(
				writableType,
				operatorKind as ts.AssignmentOperator,
				valueType,
			);
			const { writable, readable, value } = transformWritableAssignment(
				state,
				expression.left,
				expression.right,
				operator === undefined,
				operator === undefined,
			);
			if (operator !== undefined) {
				return luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: writable,
						operator,
						right: getAssignableValue(operator, value, valueType),
					}),
				);
			} else {
				return luau.list.make(
					createCompoundAssignmentStatement(
						state,
						expression,
						writable,
						writableType,
						readable,
						operatorKind,
						value,
						valueType,
					),
				);
			}
		}
	} else if (
		(ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) &&
		isUnaryAssignmentOperator(expression.operator)
	) {
		return luau.list.make(transformUnaryExpressionStatement(state, expression));
	}

	return wrapExpressionStatement(transformExpression(state, expression));
}

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = skipDownwards(node.expression);
	return transformExpressionStatementInner(state, expression);
}
