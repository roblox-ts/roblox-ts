import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { createBitwiseCall, isBitwiseOperator } from "TSTransformer/util/bitwise";
import { getKindName } from "TSTransformer/util/getKindName";
import { isDefinitelyType, isStringType } from "TSTransformer/util/types";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

const OPERATOR_MAP = new Map<ts.SyntaxKind, luau.BinaryOperator>([
	// comparison
	[ts.SyntaxKind.LessThanToken, "<"],
	[ts.SyntaxKind.GreaterThanToken, ">"],
	[ts.SyntaxKind.LessThanEqualsToken, "<="],
	[ts.SyntaxKind.GreaterThanEqualsToken, ">="],
	[ts.SyntaxKind.EqualsEqualsEqualsToken, "=="],
	[ts.SyntaxKind.ExclamationEqualsEqualsToken, "~="],

	// math
	[ts.SyntaxKind.MinusToken, "-"],
	[ts.SyntaxKind.AsteriskToken, "*"],
	[ts.SyntaxKind.SlashToken, "/"],
	[ts.SyntaxKind.AsteriskAsteriskToken, "^"],
	[ts.SyntaxKind.PercentToken, "%"],
]);

function createBinaryAdd(left: luau.Expression, leftType: ts.Type, right: luau.Expression, rightType: ts.Type) {
	const leftIsString = isDefinitelyType(leftType, isStringType);
	const rightIsString = isDefinitelyType(rightType, isStringType);
	if (leftIsString || rightIsString) {
		return luau.binary(
			leftIsString ? left : luau.call(luau.globals.tostring, [left]),
			"..",
			rightIsString ? right : luau.call(luau.globals.tostring, [right]),
		);
	} else {
		return luau.binary(left, "+", right);
	}
}

export function createBinaryFromOperator(
	state: TransformState,
	node: ts.Node,
	left: luau.Expression,
	leftType: ts.Type,
	operatorKind: ts.BinaryOperator,
	right: luau.Expression,
	rightType: ts.Type,
): luau.Expression {
	// simple
	const operator = OPERATOR_MAP.get(operatorKind);
	if (operator !== undefined) {
		return luau.binary(left, operator, right);
	}

	// plus
	if (operatorKind === ts.SyntaxKind.PlusToken || operatorKind === ts.SyntaxKind.PlusEqualsToken) {
		return createBinaryAdd(left, leftType, right, rightType);
	}

	// bitwise assignment
	if (isBitwiseOperator(operatorKind)) {
		return createBitwiseCall(operatorKind, [left, right]);
	}

	if (operatorKind === ts.SyntaxKind.CommaToken) {
		state.prereqList(wrapExpressionStatement(left));
		return right;
	}

	assert(false, `createBinaryFromOperator unknown operator: ${getKindName(operatorKind)}`);
}
