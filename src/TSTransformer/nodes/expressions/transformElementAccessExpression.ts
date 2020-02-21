import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { transformOptionalChain } from "TSTransformer/util/optionalChain";
import ts from "typescript";
import { pushToVar } from "TSTransformer/util/pushToVar";

// hack for now until we can detect arrays
export function addOneIfNumber(expression: lua.Expression) {
	if (lua.isNumberLiteral(expression)) {
		return lua.create(lua.SyntaxKind.NumberLiteral, {
			value: expression.value + 1,
		});
	}
	return expression;
}

export function transformElementAccessExpressionInner(
	state: TransformState,
	expression: lua.IndexableExpression,
	argumentExpression: ts.Expression,
) {
	const { expression: index, statements } = state.capturePrereqs(() =>
		transformExpression(state, argumentExpression),
	);
	if (!lua.list.isEmpty(statements)) {
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: pushToVar(state, expression),
			index: addOneIfNumber(index),
		});
	}
	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfNumber(index),
	});
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	return transformOptionalChain(state, node);
}
