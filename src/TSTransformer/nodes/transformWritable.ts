import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
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

export function transformWritableAssignmentWithType(
	state: TransformState,
	writeNode: ts.Expression,
	valueNode: ts.Expression,
	multipleUse: boolean,
) {
	const writable = transformWritableExpression(state, writeNode, multipleUse);
	const [value, prereqs] = state.capture(() => transformExpression(state, valueNode));
	const readable = lua.list.isEmpty(prereqs) ? writable : state.pushToVar(writable);
	state.prereqList(prereqs);
	return { writable, readable, value };
}
