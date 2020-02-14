import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	createAssignmentExpression,
	createCompoundAssignmentExpression,
	isAssignmentOperator,
	isCompoundAssignmentOperator,
} from "TSTransformer/util/assignment";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { transformLogical } from "TSTransformer/util/transformLogical";
import { transformWritableAssignment } from "TSTransformer/util/transformWritable";
import ts from "typescript";

// BINARY
// - LessThanLessThanToken
// - GreaterThanGreaterThanToken
// - GreaterThanGreaterThanGreaterThanToken
// - AmpersandToken
// - BarToken
// - CaretToken
// - TildeToken

// BINARY ASSIGNMENT
// - LessThanLessThanEqualsToken
// - GreaterThanGreaterThanEqualsToken
// - GreaterThanGreaterThanGreaterThanEqualsToken
// - AmpersandEqualsToken
// - BarEqualsToken
// - CaretEqualsToken

const SIMPLE_OPERATOR_MAP = new Map([
	[ts.SyntaxKind.LessThanToken, lua.BinaryOperator.LessThan],
	[ts.SyntaxKind.GreaterThanToken, lua.BinaryOperator.GreaterThan],
	[ts.SyntaxKind.LessThanEqualsToken, lua.BinaryOperator.LessThanEquals],
	[ts.SyntaxKind.GreaterThanEqualsToken, lua.BinaryOperator.GreaterThanEquals],
	[ts.SyntaxKind.EqualsEqualsEqualsToken, lua.BinaryOperator.EqualsEquals],
	[ts.SyntaxKind.ExclamationEqualsEqualsToken, lua.BinaryOperator.TildeEquals],
	[ts.SyntaxKind.PlusToken, lua.BinaryOperator.Plus],
	[ts.SyntaxKind.MinusToken, lua.BinaryOperator.Minus],
	[ts.SyntaxKind.AsteriskToken, lua.BinaryOperator.Asterisk],
	[ts.SyntaxKind.AsteriskAsteriskToken, lua.BinaryOperator.Caret],
	[ts.SyntaxKind.SlashToken, lua.BinaryOperator.Slash],
	[ts.SyntaxKind.PercentToken, lua.BinaryOperator.Percent],
]);

export function transformBinaryExpression(state: TransformState, node: ts.BinaryExpression) {
	const operatorKind = node.operatorToken.kind;

	// banned
	if (operatorKind === ts.SyntaxKind.EqualsEqualsToken) {
		throw "operator '==' is not supported! Use '===' instead.";
	} else if (operatorKind === ts.SyntaxKind.ExclamationEqualsToken) {
		throw "operator '!=' is not supported! Use '!==' instead.";
	}

	// logical
	if (
		operatorKind === ts.SyntaxKind.AmpersandAmpersandToken ||
		operatorKind === ts.SyntaxKind.BarBarToken ||
		operatorKind === ts.SyntaxKind.QuestionQuestionToken
	) {
		return transformLogical(state, node);
	}

	if (isAssignmentOperator(operatorKind)) {
		const { writable, value } = transformWritableAssignment(state, node.left, node.right);
		if (isCompoundAssignmentOperator(operatorKind)) {
			return createCompoundAssignmentExpression(state, writable, operatorKind, value);
		} else {
			return createAssignmentExpression(state, writable, value);
		}
	}

	const simpleOperator = SIMPLE_OPERATOR_MAP.get(operatorKind);
	if (simpleOperator === undefined) {
		throw new Error(`Unrecognized operatorToken: ${ts.SyntaxKind[operatorKind]}`);
	}

	const [left, right] = ensureTransformOrder(state, [
		() => transformExpression(state, node.left),
		() => transformExpression(state, node.right),
	]);
	return lua.create(lua.SyntaxKind.BinaryExpression, { left, operator: simpleOperator, right });
}
