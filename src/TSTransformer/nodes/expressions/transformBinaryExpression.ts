import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { transformObjectBindingLiteral } from "TSTransformer/nodes/binding/transformObjectBindingLiteral";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformLogical } from "TSTransformer/nodes/transformLogical";
import { transformWritableAssignmentWithType } from "TSTransformer/nodes/transformWritable";
import { createAssignmentExpression, createCompoundAssignmentExpression } from "TSTransformer/util/assignment";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

export function transformBinaryExpression(state: TransformState, node: ts.BinaryExpression) {
	const operatorKind = node.operatorToken.kind;

	// banned
	if (operatorKind === ts.SyntaxKind.EqualsEqualsToken) {
		state.addDiagnostic(diagnostics.noEqualsEquals(node));
		return lua.emptyId();
	} else if (operatorKind === ts.SyntaxKind.ExclamationEqualsToken) {
		state.addDiagnostic(diagnostics.noExclamationEquals(node));
		return lua.emptyId();
	}

	// logical
	if (
		operatorKind === ts.SyntaxKind.AmpersandAmpersandToken ||
		operatorKind === ts.SyntaxKind.BarBarToken ||
		operatorKind === ts.SyntaxKind.QuestionQuestionToken
	) {
		return transformLogical(state, node);
	}

	if (ts.isAssignmentOperator(operatorKind)) {
		// in destructuring, rhs must be executed first
		if (ts.isArrayLiteralExpression(node.left)) {
			const parentId = state.pushToVar(transformExpression(state, node.right));
			const accessType = state.getType(node.right);
			transformArrayBindingLiteral(state, node.left, parentId, accessType);
			return parentId;
		} else if (ts.isObjectLiteralExpression(node.left)) {
			const parentId = state.pushToVar(transformExpression(state, node.right));
			const accessType = state.getType(node.right);
			transformObjectBindingLiteral(state, node.left, parentId, accessType);
			return parentId;
		}

		const { writable, value } = transformWritableAssignmentWithType(state, node.left, node.right);
		if (ts.isCompoundAssignment(operatorKind)) {
			return createCompoundAssignmentExpression(state, writable, operatorKind, value);
		} else {
			return createAssignmentExpression(state, writable.node, value.node);
		}
	}

	const [left, right] = ensureTransformOrder(state, [node.left, node.right]);

	return createBinaryFromOperator(
		{
			node: left,
			type: state.getSimpleTypeFromNode(node.left),
		},
		operatorKind,
		{
			node: right,
			type: state.getSimpleTypeFromNode(node.right),
		},
	);
}
