import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { NodeWithType } from "TSTransformer/types/NodeWithType";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import ts from "byots";

export function createAssignmentStatement(writable: lua.WritableExpression, value: lua.Expression) {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: writable,
		right: value,
	});
}

export function createAssignmentExpression(
	state: TransformState,
	writable: lua.WritableExpression,
	value: lua.Expression,
) {
	if (lua.isAnyIdentifier(writable)) {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: writable,
				right: value,
			}),
		);
		return writable;
	} else {
		const id = state.pushToVar(value);
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: writable,
				right: id,
			}),
		);
		return id;
	}
}

export function createCompoundAssignmentStatement(
	writable: NodeWithType<lua.WritableExpression>,
	operator: ts.SyntaxKind,
	value: NodeWithType<lua.Expression>,
) {
	return createAssignmentStatement(writable.node, createBinaryFromOperator(writable, operator, value));
}

export function createCompoundAssignmentExpression(
	state: TransformState,
	writable: NodeWithType<lua.WritableExpression>,
	operator: ts.SyntaxKind,
	value: NodeWithType<lua.Expression>,
) {
	return createAssignmentExpression(state, writable.node, createBinaryFromOperator(writable, operator, value));
}
