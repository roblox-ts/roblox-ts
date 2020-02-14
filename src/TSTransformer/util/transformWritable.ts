import * as lua from "LuaAST";
import { addOneIfNumber } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { pushToVar, pushToVarIfNonId } from "TSTransformer/util/pushToVar";
import ts from "typescript";

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
		const [expression, index] = ensureTransformOrder(state, [
			() => transformExpression(state, node.expression),
			() => transformExpression(state, node.argumentExpression),
		]);
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: push(state, expression),
			index: addOneIfNumber(index),
		});
	} else {
		const transformed = transformExpression(state, node);
		if (lua.isIdentifier(transformed)) {
			return transformed;
		} else {
			throw "???";
		}
	}
}

export function transformWritableAssignment(state: TransformState, writeNode: ts.Expression, valueNode: ts.Expression) {
	const { statements: valueStatements, expression: value } = state.capturePrereqs(() =>
		transformExpression(state, valueNode),
	);
	const writable = transformWritableExpression(state, writeNode, !lua.list.isEmpty(valueStatements));
	state.prereqList(valueStatements);
	return { writable, value };
}
