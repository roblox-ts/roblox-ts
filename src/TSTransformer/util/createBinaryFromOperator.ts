import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { isStringType } from "TSTransformer/util/types";
import { wrapToString } from "TSTransformer/util/wrapToString";

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
) {
	const leftIsString = isStringType(leftType);
	const rightIsString = isStringType(rightType);
	if (leftIsString || rightIsString) {
		return luau.binary(leftIsString ? left : wrapToString(left), "..", rightIsString ? right : wrapToString(right));
	} else {
		return luau.binary(left, "+", right);
	}
}

export function createBinaryFromOperator(
	state: TransformState,
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
		return createBinaryAdd(state, left, leftType, right, rightType);
	}

	// bitwise
	const bit32Name = BITWISE_OPERATOR_MAP.get(operatorKind);
	if (bit32Name !== undefined) {
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
				expression: luau.globals.bit32,
				name: bit32Name,
			}),
			args: luau.list.make(left, right),
		});
	}

	if (
		operatorKind === ts.SyntaxKind.GreaterThanGreaterThanToken ||
		operatorKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken
	) {
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: state.TS("bit_lrsh"),
			args: luau.list.make(left, right),
		});
	}

	assert(false, `Unrecognized operator: ${ts.SyntaxKind[operatorKind]}`);
}
