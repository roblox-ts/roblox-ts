import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { getKindName } from "TSTransformer/util/getKindName";
import { isDefinitelyType, isNumberType, isOneOfArrayDefinitelyType, isStringType } from "TSTransformer/util/types";
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

const BITWISE_OPERATOR_MAP = new Map<ts.SyntaxKind, string>([
	// bitwise
	[ts.SyntaxKind.AmpersandToken, "band"],
	[ts.SyntaxKind.BarToken, "bor"],
	[ts.SyntaxKind.CaretToken, "bxor"],
	[ts.SyntaxKind.LessThanLessThanToken, "lshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, "rshift"],

	// bitwise compound assignment
	[ts.SyntaxKind.AmpersandEqualsToken, "band"],
	[ts.SyntaxKind.BarEqualsToken, "bor"],
	[ts.SyntaxKind.CaretEqualsToken, "bxor"],
	[ts.SyntaxKind.LessThanLessThanEqualsToken, "lshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, "rshift"],
]);

function createBinaryAdd(
	state: TransformState,
	left: luau.Expression,
	leftType: ts.Type,
	right: luau.Expression,
	rightType: ts.Type,
	originNode: ts.BinaryExpression,
) {
	if (isOneOfArrayDefinitelyType(state, [leftType, rightType], [originNode.left, originNode.right], isStringType)) {
		// both sides must be string or number, otherwise Luau will error
		if (!isDefinitelyType(state, leftType, undefined, isStringType, isNumberType)) {
			left = luau.call(luau.globals.tostring, [left]);
		}
		if (!isDefinitelyType(state, rightType, undefined, isStringType, isNumberType)) {
			right = luau.call(luau.globals.tostring, [right]);
		}
		return luau.binary(left, "..", right);
	} else {
		return luau.binary(left, "+", right);
	}
}

export function createBinaryFromOperator(
	state: TransformState,
	node: ts.BinaryExpression,
	left: luau.Expression,
	leftType: ts.Type,
	operatorKind: ts.SyntaxKind,
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
		return createBinaryAdd(state, left, leftType, right, rightType, node);
	}

	// bitwise
	const bit32Name = BITWISE_OPERATOR_MAP.get(operatorKind);
	if (bit32Name !== undefined) {
		return luau.call(luau.property(luau.globals.bit32, bit32Name), [left, right]);
	}

	if (
		operatorKind === ts.SyntaxKind.GreaterThanGreaterThanToken ||
		operatorKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken
	) {
		return luau.call(state.TS(node, "bit_lrsh"), [left, right]);
	}

	if (operatorKind === ts.SyntaxKind.CommaToken) {
		state.prereqList(wrapExpressionStatement(left));
		return right;
	}

	assert(false, `Unrecognized operator: ${getKindName(operatorKind)}`);
}
