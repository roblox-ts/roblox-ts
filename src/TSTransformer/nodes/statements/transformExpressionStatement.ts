import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformLogicalOrCoalescingAssignmentExpressionStatement } from "TSTransformer/nodes/transformLogicalOrCoalescingAssignmentExpression";
import { transformWritableAssignment, transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { isUnaryAssignmentOperator } from "TSTransformer/typeGuards";
import {
	createAssignmentStatement,
	createCompoundAssignmentStatement,
	getSimpleAssignmentOperator,
} from "TSTransformer/util/assignment";
import { getAssignableValue } from "TSTransformer/util/getAssignableValue";
import { skipDownwards } from "TSTransformer/util/traversal";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

function transformUnaryExpressionStatement(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	const writable = transformWritableExpression(state, prereqs, node.operand, false);
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
	const statements = luau.list.make<luau.Statement>();
	const prereqs = new Prereqs();

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
				prereqs,
				expression.left,
				expression.right,
				operator === undefined,
				operator !== "=",
			);

			let assignment: luau.Assignment;
			if (operator !== undefined) {
				assignment = createAssignmentStatement(
					writable,
					operator,
					getAssignableValue(operator, value, valueType),
					readable,
				);
			} else {
				assignment = createCompoundAssignmentStatement(
					prereqs,
					writable,
					writableType,
					readable,
					operatorKind,
					value,
					valueType,
				);
			}

			luau.list.pushList(statements, prereqs.statements);
			luau.list.push(statements, assignment);
			return statements;
		}
	} else if (
		(ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) &&
		isUnaryAssignmentOperator(expression.operator)
	) {
		const assignment = transformUnaryExpressionStatement(state, prereqs, expression);
		luau.list.pushList(statements, prereqs.statements);
		luau.list.push(statements, assignment);
		return statements;
	}

	const expressionStatements = wrapExpressionStatement(transformExpression(state, prereqs, expression));
	luau.list.pushList(statements, prereqs.statements);
	luau.list.pushList(statements, expressionStatements);
	return statements;
}

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = skipDownwards(node.expression);
	return transformExpressionStatementInner(state, expression);
}
