import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { ensureExecutionOrder } from "TSTransformer/util/ensureExecutionOrder";
import { pushToVar, pushToVarIfNonId } from "TSTransformer/util/pushToVar";
import ts from "typescript";

export function getWritableExpression(
	state: TransformState,
	node: ts.Expression,
): lua.Identifier | lua.TemporaryIdentifier | lua.PropertyAccessExpression | lua.ComputedIndexExpression {
	if (ts.isPropertyAccessExpression(node)) {
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: pushToVarIfNonId(state, transformExpression(state, node.expression)),
			name: node.name.text,
		});
	} else if (ts.isElementAccessExpression(node)) {
		const [expression, index] = ensureExecutionOrder(state, [node.expression, node.argumentExpression]);
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: pushToVarIfNonId(state, expression),
			index,
		});
	} else {
		const transformed = transformExpression(state, node);
		if (lua.isIdentifier(transformed)) {
			return transformed;
		} else {
			return pushToVar(state, transformed);
		}
	}
}

// test2
