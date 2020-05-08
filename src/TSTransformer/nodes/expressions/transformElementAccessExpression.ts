import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isMethod } from "TSTransformer/util/isMethod";
import { offset } from "TSTransformer/util/offset";
import { isArrayType, isLuaTupleType } from "TSTransformer/util/types";

export function addOneIfArrayType(state: TransformState, type: ts.Type, expression: lua.Expression) {
	if (isArrayType(state, type)) {
		return offset(expression, 1);
	} else {
		return expression;
	}
}

export function transformElementAccessExpressionInner(
	state: TransformState,
	node: ts.ElementAccessExpression,
	expression: lua.Expression,
	argumentExpression: ts.Expression,
) {
	if (isMethod(state, node)) {
		state.addDiagnostic(diagnostics.noIndexWithoutCall(node));
		return lua.emptyId();
	}

	const { expression: index, statements } = state.capturePrereqs(() =>
		transformExpression(state, argumentExpression),
	);

	const expType = state.getType(node.expression);
	if (!lua.list.isEmpty(statements)) {
		// hack because wrapReturnIfLuaTuple will not wrap this, but now we need to!
		if (isLuaTupleType(state, expType)) {
			expression = lua.array([expression]);
		}

		expression = state.pushToVar(expression);
		state.prereqList(statements);
	}

	// LuaTuple<T> checks
	if (lua.isCall(expression) && isLuaTupleType(state, expType)) {
		// wrap in select() if it isn't the first value
		if (!lua.isNumberLiteral(index) || index.value !== 0) {
			expression = lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.select,
				args: lua.list.make<lua.Expression>(offset(index, 1), expression),
			});
		}
		// parentheses to trim off the rest of the values
		return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
	}

	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfArrayType(state, expType, index),
	});
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	return transformOptionalChain(state, node);
}
