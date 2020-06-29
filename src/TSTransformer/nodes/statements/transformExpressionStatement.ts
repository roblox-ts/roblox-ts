import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	transformWritableAssignmentWithType,
	transformWritableExpression,
} from "TSTransformer/nodes/transformWritable";
import { isUnaryAssignmentOperator } from "TSTransformer/typeGuards";
import { createCompoundAssignmentStatement, getSimpleAssignmentOperator } from "TSTransformer/util/assignment";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isStringSimpleType } from "TSTransformer/util/types";
import { wrapToString } from "TSTransformer/util/wrapToString";

function transformUnaryExpressionStatement(
	state: TransformState,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	const writable = transformWritableExpression(state, node.operand, false);
	const operator: lua.AssignmentOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=";
	return lua.create(lua.SyntaxKind.Assignment, {
		left: writable,
		operator,
		right: lua.number(1),
	});
}

export function transformExpressionStatementInner(state: TransformState, expression: ts.Expression) {
	if (ts.isBinaryExpression(expression)) {
		const operatorKind = expression.operatorToken.kind;
		if (
			ts.isAssignmentOperator(operatorKind) &&
			!ts.isArrayLiteralExpression(expression.left) &&
			!ts.isObjectLiteralExpression(expression.left)
		) {
			const writableType = state.getType(expression.left);
			const valueType = state.getType(expression.right);
			const rightSimpleType = state.getSimpleType(valueType);
			const operator = getSimpleAssignmentOperator(
				state.getSimpleType(writableType),
				operatorKind as ts.AssignmentOperator,
				rightSimpleType,
			);
			const { writable, readable, value } = transformWritableAssignmentWithType(
				state,
				expression.left,
				expression.right,
				operator === undefined,
			);
			if (operator !== undefined) {
				return lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: writable,
						operator,
						right: operator === "..=" && !isStringSimpleType(rightSimpleType) ? wrapToString(value) : value,
					}),
				);
			} else {
				return lua.list.make(
					createCompoundAssignmentStatement(
						state,
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
