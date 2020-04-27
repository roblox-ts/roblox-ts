import * as lua from "LuaAST";
import { addOneIfNumber } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { pushToVar, pushToVarIfNonId } from "TSTransformer/util/pushToVar";
import ts from "typescript";
import { NodeWithType } from "TSTransformer/types/NodeWithType";

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
			index: addOneIfNumber(index),
		});
	} else {
		const transformed = transformExpression(state, node);
		if (lua.isAnyIdentifier(transformed)) {
			return transformed;
		} else {
			throw new Error("Not implemented");
		}
	}
}

export function transformWritableExpressionWithType(
	state: TransformState,
	node: ts.Expression,
	forcePush = false,
): NodeWithType<lua.WritableExpression> {
	return {
		node: transformWritableExpression(state, node, forcePush),
		type: state.getSimpleType(node),
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
			type: state.getSimpleType(writeNode),
		},
		value: {
			node: value,
			type: state.getSimpleType(valueNode),
		},
	};
}
