import * as lua from "LuaAST";
import { addOneIfArrayType } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { pushToVar, pushToVarIfNonId } from "TSTransformer/util/pushToVar";
import ts from "byots";
import { NodeWithType } from "TSTransformer/types/NodeWithType";
import { assert } from "Shared/util/assert";

export function transformWritableExpression(
	state: TransformState,
	node: ts.Expression,
	forcePush = false,
): lua.WritableExpression {
	const push = forcePush ? pushToVar : pushToVarIfNonId;
	if (ts.isPropertyAccessExpression(node)) {
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: push(state, transformExpression(state, node.expression)),
			name: node.name.text,
		});
	} else if (ts.isElementAccessExpression(node)) {
		const [expression, index] = ensureTransformOrder(state, [node.expression, node.argumentExpression]);
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: push(state, expression),
			index: addOneIfArrayType(state, state.getType(node.expression), index),
		});
	} else {
		const transformed = transformExpression(state, node);
		assert(lua.isAnyIdentifier(transformed));
		return transformed;
	}
}

export function transformWritableExpressionWithType(
	state: TransformState,
	node: ts.Expression,
	forcePush = false,
): NodeWithType<lua.WritableExpression> {
	return {
		node: transformWritableExpression(state, node, forcePush),
		type: state.getSimpleTypeFromNode(node),
	};
}

export function transformWritableAssignment(state: TransformState, writeNode: ts.Expression, valueNode: ts.Expression) {
	const { statements: valueStatements, expression: value } = state.capturePrereqs(() =>
		transformExpression(state, valueNode),
	);
	const writable = transformWritableExpression(state, writeNode, !lua.list.isEmpty(valueStatements));
	state.prereqList(valueStatements);
	return { writable, value };
}

export function transformWritableAssignmentWithType(
	state: TransformState,
	writeNode: ts.Expression,
	valueNode: ts.Expression,
) {
	const { writable, value } = transformWritableAssignment(state, writeNode, valueNode);
	return {
		writable: {
			node: writable,
			type: state.getSimpleTypeFromNode(writeNode),
		},
		value: {
			node: value,
			type: state.getSimpleTypeFromNode(valueNode),
		},
	};
}
