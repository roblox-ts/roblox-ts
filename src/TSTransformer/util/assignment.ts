import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
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

export function getSimpleAssignmentOperator(
	state: TransformState,
	leftType: ts.Type,
	operatorKind: ts.AssignmentOperator,
	rightType: ts.Type,
	node: ts.BinaryExpression,
) {
	// plus
	if (operatorKind === ts.SyntaxKind.PlusEqualsToken) {
		const isString = isDefinitelyType(state, [leftType, rightType], node, isStringType);
		return isString ? "..=" : "+=";
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
	node: ts.BinaryExpression,
	writable: luau.WritableExpression,
	writableType: ts.Type,
	readable: luau.WritableExpression,
	operator: ts.SyntaxKind,
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
	node: ts.BinaryExpression,
	writable: luau.WritableExpression,
	writableType: ts.Type,
	readable: luau.WritableExpression,
	operator: ts.SyntaxKind,
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
