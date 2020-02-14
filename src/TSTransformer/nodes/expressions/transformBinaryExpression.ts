import { TransformState } from "TSTransformer";
import {
	createAssignmentExpression,
	createCompoundAssignmentExpression,
	isAssignmentOperator,
	isCompoundAssignmentOperator,
} from "TSTransformer/util/assignment";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { transformLogical } from "TSTransformer/util/transformLogical";
import { transformWritableAssignment } from "TSTransformer/util/transformWritable";
import ts from "typescript";

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

	const [left, right] = ensureTransformOrder(state, [node.left, node.right]);
	return createBinaryFromOperator(left, operatorKind, right);
}
