import ts from "byots";
import * as lua from "LuaAST";
import tsst from "ts-simple-type";
import { TransformState } from "TSTransformer";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { isStringSimpleType } from "TSTransformer/util/types";

const COMPOUND_OPERATOR_MAP = new Map<ts.SyntaxKind, lua.AssignmentOperator>([
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
	readable: lua.WritableExpression,
	operator: lua.AssignmentOperator,
	value: lua.Expression,
) {
	if (lua.isAnyIdentifier(readable)) {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: readable,
				operator,
				right: value,
			}),
		);
		return readable;
	} else {
		const id = state.pushToVar(value);
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: readable,
				operator,
				right: id,
			}),
		);
		return id;
	}
}

function wrapRightIfBinary(expression: lua.Expression) {
	if (lua.isBinaryExpression(expression) && lua.isBinaryExpression(expression.right)) {
		expression.right = lua.create(lua.SyntaxKind.ParenthesizedExpression, {
			expression: expression.right,
		});
	}
	return expression;
}

export function createCompoundAssignmentStatement(
	state: TransformState,
	writable: lua.WritableExpression,
	writableType: ts.Type,
	readable: lua.WritableExpression,
	operator: ts.SyntaxKind,
	value: lua.Expression,
	valueType: ts.Type,
) {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: writable,
		operator: "=",
		right: wrapRightIfBinary(createBinaryFromOperator(state, readable, writableType, operator, value, valueType)),
	});
}

export function createCompoundAssignmentExpression(
	state: TransformState,
	writable: lua.WritableExpression,
	writableType: ts.Type,
	readable: lua.WritableExpression,
	operator: ts.SyntaxKind,
	value: lua.Expression,
	valueType: ts.Type,
) {
	return createAssignmentExpression(
		state,
		writable,
		"=",
		wrapRightIfBinary(createBinaryFromOperator(state, readable, writableType, operator, value, valueType)),
	);
}
