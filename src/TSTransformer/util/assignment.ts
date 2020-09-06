import ts from "byots";
import luau from "LuauAST";
import * as tsst from "ts-simple-type";
import { TransformState } from "TSTransformer";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { isStringSimpleType } from "TSTransformer/util/types";

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
	leftType: tsst.SimpleType,
	operatorKind: ts.AssignmentOperator,
	rightType: tsst.SimpleType,
) {
	// plus
	if (operatorKind === ts.SyntaxKind.PlusEqualsToken) {
		return isStringSimpleType(leftType) || isStringSimpleType(rightType) ? "..=" : "+=";
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
		right: createBinaryFromOperator(state, readable, writableType, operator, value, valueType),
	});
}

export function createCompoundAssignmentExpression(
	state: TransformState,
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
		createBinaryFromOperator(state, readable, writableType, operator, value, valueType),
	);
}
