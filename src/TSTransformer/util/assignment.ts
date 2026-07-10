import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { commutes, summarizeExpression } from "TSTransformer/util/effects";
import { isDefinitelyType, isStringType } from "TSTransformer/util/types";
import ts from "typescript";

const COMPOUND_OPERATOR_MAP = new Map<ts.SyntaxKind, luau.AssignmentOperator>([
	// compound assignment
	[ts.SyntaxKind.MinusEqualsToken, "-="],
	[ts.SyntaxKind.AsteriskEqualsToken, "*="],
	[ts.SyntaxKind.SlashEqualsToken, "/="],
	[ts.SyntaxKind.AsteriskAsteriskEqualsToken, "^="],
	[ts.SyntaxKind.PercentEqualsToken, "%="],

	// unary
	[ts.SyntaxKind.PlusPlusToken, "+="],
	[ts.SyntaxKind.MinusMinusToken, "-="],

	// normal assignment
	[ts.SyntaxKind.EqualsToken, "="],
]);

/**
 * Luau's compound assignment (`x *= f()`) reads a local target's register at the operator
 * instruction, after the value's inline code has run — but TypeScript reads the target
 * first. When the value may change what the target read observes, the simple compound
 * operator cannot be used; the read must be materialized ahead of the value
 * (`local _readable = x; x = _readable * f()`).
 */
export function compoundReadNeedsMaterializing(
	state: TransformState,
	writable: luau.WritableExpression,
	writeNode: ts.Expression,
	value: luau.Expression,
	valueNode: ts.Expression,
): boolean {
	return (
		luau.isIdentifier(writable) &&
		!commutes(summarizeExpression(state, writable, writeNode), summarizeExpression(state, value, valueNode))
	);
}

export function getSimpleAssignmentOperator(
	leftType: ts.Type,
	operatorKind: ts.AssignmentOperator,
	rightType: ts.Type,
) {
	// plus
	if (operatorKind === ts.SyntaxKind.PlusEqualsToken) {
		return isDefinitelyType(leftType, isStringType) || isDefinitelyType(rightType, isStringType) ? "..=" : "+=";
	}

	return COMPOUND_OPERATOR_MAP.get(operatorKind);
}

export function createAssignmentExpression(
	state: TransformState,
	readable: luau.WritableExpression,
	operator: luau.AssignmentOperator,
	value: luau.Expression,
) {
	state.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: readable,
			operator,
			right: value,
		}),
	);
	return readable;
}

export function createCompoundAssignmentStatement(
	state: TransformState,
	node: ts.Node,
	writable: luau.WritableExpression,
	writableType: ts.Type,
	readable: luau.WritableExpression,
	operator: ts.BinaryOperator,
	value: luau.Expression,
	valueType: ts.Type,
) {
	return luau.create(luau.SyntaxKind.Assignment, {
		left: writable,
		operator: "=",
		right: createBinaryFromOperator(state, node, readable, writableType, operator, value, valueType),
	});
}

export function createCompoundAssignmentExpression(
	state: TransformState,
	node: ts.Node,
	writable: luau.WritableExpression,
	writableType: ts.Type,
	readable: luau.WritableExpression,
	operator: ts.BinaryOperator,
	value: luau.Expression,
	valueType: ts.Type,
) {
	return createAssignmentExpression(
		state,
		writable,
		"=",
		createBinaryFromOperator(state, node, readable, writableType, operator, value, valueType),
	);
}
