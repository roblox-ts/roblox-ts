import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { addOneIfArrayType } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { NodeWithType } from "TSTransformer/types/NodeWithType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

export function transformWritableExpression(
	state: TransformState,
	node: ts.Expression,
	multipleUse: boolean,
): lua.WritableExpression {
	if (ts.isPrototypeAccess(node)) {
		state.addDiagnostic(diagnostics.noPrototype(node));
	}
	if (ts.isPropertyAccessExpression(node)) {
		const expression = transformExpression(state, node.expression);
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: multipleUse ? state.pushToVarIfComplex(expression) : convertToIndexableExpression(expression),
			name: node.name.text,
		});
	} else if (ts.isElementAccessExpression(node)) {
		const [expression, index] = ensureTransformOrder(state, [node.expression, node.argumentExpression]);
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: multipleUse ? state.pushToVarIfComplex(expression) : convertToIndexableExpression(expression),
			index: addOneIfArrayType(state, state.getType(node.expression), index),
		});
	} else {
		const transformed = transformExpression(state, node);
		// could be lua.PropertyAccessExpression from export let
		assert(lua.isWritableExpression(transformed));
		return transformed;
	}
}

export function transformWritableExpressionWithType(
	state: TransformState,
	node: ts.Expression,
	multipleUse: boolean,
): NodeWithType<lua.WritableExpression> {
	return {
		node: transformWritableExpression(state, node, multipleUse),
		type: state.getSimpleTypeFromNode(node),
	};
}

export function transformWritableAssignment(
	state: TransformState,
	writeNode: ts.Expression,
	valueNode: ts.Expression,
	multipleUse: boolean,
) {
	const writable = transformWritableExpression(state, writeNode, multipleUse);
	const { statements: valueStatements, expression: value } = state.capture(() =>
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
	multipleUse: boolean,
) {
	const { writable, readable, value } = transformWritableAssignment(state, writeNode, valueNode, multipleUse);
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
