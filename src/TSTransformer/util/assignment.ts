import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { NodeWithType } from "TSTransformer/types/NodeWithType";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";

export function createAssignmentStatement(writable: lua.WritableExpression, value: lua.Expression) {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: writable,
		right: value,
	});
}

export function createAssignmentExpression(
	state: TransformState,
	readable: lua.WritableExpression,
	value: lua.Expression,
) {
	if (lua.isAnyIdentifier(readable)) {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: readable,
				right: value,
			}),
		);
		return readable;
	} else {
		const id = state.pushToVar(value);
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: readable,
				right: id,
			}),
		);
		return id;
	}
}

function wrapRightIfDoubleBinary(expression: lua.Expression) {
	if (lua.isBinaryExpression(expression) && lua.isBinaryExpression(expression.right)) {
		expression.right = lua.create(lua.SyntaxKind.ParenthesizedExpression, {
			expression: expression.right,
		});
	}
	return expression;
}

export function createCompoundAssignmentStatement(
	state: TransformState,
	writable: NodeWithType<lua.WritableExpression>,
	readable: NodeWithType<lua.WritableExpression>,
	operator: ts.SyntaxKind,
	value: NodeWithType<lua.Expression>,
) {
	return createAssignmentStatement(
		writable.node,
		wrapRightIfDoubleBinary(createBinaryFromOperator(state, readable, operator, value)),
	);
}

export function createCompoundAssignmentExpression(
	state: TransformState,
	writable: NodeWithType<lua.WritableExpression>,
	readable: NodeWithType<lua.WritableExpression>,
	operator: ts.SyntaxKind,
	value: NodeWithType<lua.Expression>,
) {
	return createAssignmentExpression(
		state,
		writable.node,
		wrapRightIfDoubleBinary(createBinaryFromOperator(state, readable, operator, value)),
	);
}
