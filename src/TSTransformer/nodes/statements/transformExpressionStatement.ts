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
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { pushToVar } from "TSTransformer/util/pushToVar";
import { assert } from "Shared/util/assert";

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
		if (ts.isArrayLiteralExpression(expression.left)) {
			const parentId = pushToVar(state, transformExpression(state, expression.right));
			const accessType = state.getType(expression.right);
			transformArrayBindingLiteral(state, expression.left, parentId, accessType);
			return lua.list.make<lua.Statement>();
		}

		const operator = expression.operatorToken.kind;
		if (ts.isAssignmentOperator(operator)) {
			const { writable, value } = transformWritableAssignmentWithType(state, expression.left, expression.right);
			if (ts.isCompoundAssignment(operator)) {
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
	if (lua.isCallExpression(transformed) || lua.isMethodExpression(transformed)) {
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
