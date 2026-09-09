import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";
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

export function createAssignmentStatement(
	writable: luau.WritableExpression,
	operator: luau.AssignmentOperator,
	value: luau.Expression,
	readable: luau.WritableExpression,
) {
	return luau.create(luau.SyntaxKind.Assignment, {
		left: writable,
		operator: readable === writable ? operator : "=",
		right:
			readable === writable ? value : luau.binary(readable, operator.slice(0, -1) as luau.BinaryOperator, value),
	});
}

export function createAssignmentExpression(
	prereqs: Prereqs,
	writable: luau.WritableExpression,
	operator: luau.AssignmentOperator,
	value: luau.Expression,
	readable: luau.WritableExpression = writable,
) {
	prereqs.push(createAssignmentStatement(writable, operator, value, readable));
	return writable;
}

export function createCompoundAssignmentStatement(
	prereqs: Prereqs,
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
		right: createBinaryFromOperator(prereqs, readable, writableType, operator, value, valueType),
	});
}

export function createCompoundAssignmentExpression(
	prereqs: Prereqs,
	writable: luau.WritableExpression,
	writableType: ts.Type,
	readable: luau.WritableExpression,
	operator: ts.BinaryOperator,
	value: luau.Expression,
	valueType: ts.Type,
) {
	return createAssignmentExpression(
		prereqs,
		writable,
		"=",
		createBinaryFromOperator(prereqs, readable, writableType, operator, value, valueType),
	);
}
