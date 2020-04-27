import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { NodeWithType } from "TSTransformer/types/NodeWithType";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { pushToVar } from "TSTransformer/util/pushToVar";
import ts from "typescript";

export function isAssignmentOperator(operator: ts.SyntaxKind): operator is ts.AssignmentOperator {
	return operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
}

export function isCompoundAssignmentOperator(operator: ts.SyntaxKind): operator is ts.CompoundAssignmentOperator {
	return operator >= ts.SyntaxKind.FirstCompoundAssignment && operator <= ts.SyntaxKind.LastCompoundAssignment;
}

export function isUnaryAssignmentOperator(
	operator: ts.SyntaxKind,
): operator is ts.SyntaxKind.PlusPlusToken | ts.SyntaxKind.MinusMinusToken {
	return operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken;
}

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
		const id = pushToVar(state, value);
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
