import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isMethod } from "TSTransformer/util/isMethod";
import { offset } from "TSTransformer/util/offset";
import { isLuaTupleType, getFirstDefinedSymbol } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformElementAccessExpressionInner(
	state: TransformState,
	node: ts.ElementAccessExpression,
	expression: lua.Expression,
	argumentExpression: ts.Expression,
) {
	validateNotAnyType(state, node.expression);
	validateNotAnyType(state, node.argumentExpression);

	const symbol = getFirstDefinedSymbol(state, state.getType(node));
	if (symbol) {
		if (state.macroManager.getPropertyCallMacro(symbol)) {
			state.addDiagnostic(diagnostics.noMacroWithoutCall(node));
			return lua.emptyId();
		}
	}

	if (isMethod(state, node)) {
		state.addDiagnostic(diagnostics.noIndexWithoutCall(node));
		return lua.emptyId();
	}

	if (ts.isPrototypeAccess(node)) {
		state.addDiagnostic(diagnostics.noPrototype(node));
	}

	const constantValue = state.typeChecker.getConstantValue(node);
	if (constantValue !== undefined) {
		return typeof constantValue === "string" ? lua.string(constantValue) : lua.number(constantValue);
	}

	const { expression: index, statements } = state.capture(() => transformExpression(state, argumentExpression));

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
