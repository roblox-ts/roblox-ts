import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getKindName } from "TSTransformer/util/getKindName";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

const BITWISE_OPERATOR_MAP = new Map<ts.SyntaxKind, string>([
	// bitwise
	[ts.SyntaxKind.LessThanLessThanToken, "lshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, "rshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanToken, "arshift"],

	// bitwise compound assignment
	[ts.SyntaxKind.AmpersandEqualsToken, "band"],
	[ts.SyntaxKind.BarEqualsToken, "bor"],
	[ts.SyntaxKind.CaretEqualsToken, "bxor"],
	[ts.SyntaxKind.LessThanLessThanEqualsToken, "lshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, "rshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, "arshift"],
]);

const VARIADIC_BITWISE_OPERATOR_MAP = new Map<ts.SyntaxKind, string>([
	[ts.SyntaxKind.AmpersandToken, "band"],
	[ts.SyntaxKind.BarToken, "bor"],
	[ts.SyntaxKind.CaretToken, "bxor"],
]);

function getBit32NameFromOperator(operatorKind: ts.BinaryOperator) {
	return BITWISE_OPERATOR_MAP.get(operatorKind) ?? VARIADIC_BITWISE_OPERATOR_MAP.get(operatorKind);
}

function buildVariadicExpressionList(
	expressions: ts.Expression[],
	operatorKind: ts.BinaryOperator,
	node: ts.Expression,
) {
	if (ts.isBinaryExpression(node)) {
		if (operatorKind === node.operatorToken.kind) {
			buildVariadicExpressionList(expressions, operatorKind, node.left);

			expressions.push(skipDownwards(node.right));
		} else {
			expressions.push(node);
		}

		return;
	}

	expressions.push(skipDownwards(node));
}

export function isBitwiseOperator(operatorKind: ts.BinaryOperator) {
	return BITWISE_OPERATOR_MAP.has(operatorKind);
}

export function isVariadicBitwiseOperator(operatorKind: ts.BinaryOperator) {
	return VARIADIC_BITWISE_OPERATOR_MAP.has(operatorKind);
}

export function createBitwiseFromOperator(
	operatorKind: ts.BinaryOperator,
	expressions: luau.Expression[],
): luau.Expression {
	const name = getBit32NameFromOperator(operatorKind);
	assert(name !== undefined, `createBitwiseFromOperator unknown operator: ${getKindName(operatorKind)}`);

	return luau.call(luau.property(luau.globals.bit32, name), expressions);
}

export function createVariadicBitwiseFromOperator(
	state: TransformState,
	operatorKind: ts.BinaryOperator,
	node: ts.BinaryExpression,
): luau.Expression {
	const separatedExpressions = new Array<ts.Expression>();
	buildVariadicExpressionList(separatedExpressions, operatorKind, node.left);

	separatedExpressions.push(node.right);

	return createBitwiseFromOperator(operatorKind, ensureTransformOrder(state, separatedExpressions));
}
