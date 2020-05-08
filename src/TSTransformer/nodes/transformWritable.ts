import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { addOneIfArrayType } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { NodeWithType } from "TSTransformer/types/NodeWithType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

export function transformWritableExpression(state: TransformState, node: ts.Expression): lua.WritableExpression {
	if (ts.isPropertyAccessExpression(node)) {
		const expression = transformExpression(state, node.expression);
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(expression),
			name: node.name.text,
		});
	} else if (ts.isElementAccessExpression(node)) {
		const [expression, index] = ensureTransformOrder(state, [node.expression, node.argumentExpression]);
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
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
): NodeWithType<lua.WritableExpression> {
	return {
		node: transformWritableExpression(state, node),
		type: state.getSimpleTypeFromNode(node),
	};
}

export function transformWritableAssignment(state: TransformState, writeNode: ts.Expression, valueNode: ts.Expression) {
	const writable = transformWritableExpression(state, writeNode);
	const { statements: valueStatements, expression: value } = state.capturePrereqs(() =>
		transformExpression(state, valueNode),
	);
	const readable = lua.list.isEmpty(valueStatements) ? writable : state.pushToVar(writable);
	state.prereqList(valueStatements);
	return { writable, readable, value };
}

export function transformWritableAssignmentWithType(
	state: TransformState,
	writeNode: ts.Expression,
	valueNode: ts.Expression,
) {
	const { writable, readable, value } = transformWritableAssignment(state, writeNode, valueNode);
	return {
		writable: {
			node: writable,
			type: state.getSimpleTypeFromNode(writeNode),
		},
		readable: {
			node: readable,
			type: state.getSimpleTypeFromNode(writeNode),
		},
		value: {
			node: value,
			type: state.getSimpleTypeFromNode(valueNode),
		},
	};
}
