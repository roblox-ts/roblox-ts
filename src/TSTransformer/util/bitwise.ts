import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { TransformState } from "TSTransformer/classes/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getKindName } from "TSTransformer/util/getKindName";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

const OPERATOR_MAP = new Map<ts.SyntaxKind, string>([
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

const LOGICAL_OPERATOR_MAP = new Map<ts.SyntaxKind, string>([
	[ts.SyntaxKind.AmpersandToken, "band"],
	[ts.SyntaxKind.BarToken, "bor"],
	[ts.SyntaxKind.CaretToken, "bxor"],
]);

function flattenBitwiseSegmentInto(
	expressionList: Array<ts.Expression>,
	operatorKind: ts.BinaryOperator,
	node: ts.Expression,
) {
	if (ts.isBinaryExpression(node)) {
		if (operatorKind === node.operatorToken.kind) {
			flattenBitwiseSegmentInto(expressionList, operatorKind, node.left);

			expressionList.push(skipDownwards(node.right));
		} else {
			expressionList.push(node);
		}

		return;
	}

	expressionList.push(skipDownwards(node));
}

function isBitwiseLogicalOperator(operatorKind: ts.BinaryOperator) {
	return LOGICAL_OPERATOR_MAP.has(operatorKind);
}

export function isBitwiseOperator(operatorKind: ts.BinaryOperator) {
	return OPERATOR_MAP.has(operatorKind) || isBitwiseLogicalOperator(operatorKind);
}

export function createBitwiseCall(
	operatorKind: ts.BinaryOperator,
	expressions: Array<luau.Expression>,
): luau.Expression {
	const name = OPERATOR_MAP.get(operatorKind) ?? LOGICAL_OPERATOR_MAP.get(operatorKind);
	assert(name !== undefined, `createBitwiseFromOperator unknown operator: ${getKindName(operatorKind)}`);

	return luau.call(luau.property(luau.globals.bit32, name), expressions);
}

export function createBitwiseFromOperator(
	state: TransformState,
	prereqs: Prereqs,
	operatorKind: ts.BinaryOperator,
	node: ts.BinaryExpression,
): luau.Expression {
	const flattenedExpressions = new Array<ts.Expression>();
	if (isBitwiseLogicalOperator(operatorKind)) {
		flattenBitwiseSegmentInto(flattenedExpressions, operatorKind, node.left);

		flattenedExpressions.push(node.right);
	} else {
		flattenedExpressions.push(node.left, node.right);
	}

	return createBitwiseCall(operatorKind, ensureTransformOrder(state, prereqs, flattenedExpressions));
}
