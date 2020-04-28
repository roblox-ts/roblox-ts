import * as lua from "LuaAST";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isMethod } from "TSTransformer/util/isMethod";
import { transformOptionalChain } from "TSTransformer/util/optionalChain";
import { pushToVar } from "TSTransformer/util/pushToVar";
import ts from "byots";

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
	node: ts.ElementAccessExpression,
	expression: lua.IndexableExpression,
	argumentExpression: ts.Expression,
) {
	if (isMethod(state, node)) {
		state.addDiagnostic(diagnostics.noIndexWithoutCall(node));
	}

	const { expression: index, statements } = state.capturePrereqs(() =>
		transformExpression(state, argumentExpression),
	);

	if (!lua.list.isEmpty(statements)) {
		expression = pushToVar(state, expression);
		state.prereqList(statements);
	}

	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfNumber(index),
	});
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	return transformOptionalChain(state, node);
}
