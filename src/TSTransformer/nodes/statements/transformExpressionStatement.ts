import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformLogicalOrCoalescingAssignmentExpressionStatement } from "TSTransformer/nodes/transformLogicalOrCoalescingAssignmentExpression";
import { transformWritableAssignment } from "TSTransformer/nodes/transformWritable";
import { createCompoundAssignmentStatement, getSimpleAssignmentOperator } from "TSTransformer/util/assignment";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isDefinitelyType, isStringType } from "TSTransformer/util/types";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

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
				state,
				writableType,
				operatorKind as ts.AssignmentOperator,
				valueType,
				expression,
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
						right:
							operator === "..=" && !isDefinitelyType(state, valueType, expression.right, isStringType)
								? luau.call(luau.globals.tostring, [value])
								: value,
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
	}

	return wrapExpressionStatement(transformExpression(state, expression));
}

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = skipDownwards(node.expression);
	return transformExpressionStatementInner(state, expression);
}
