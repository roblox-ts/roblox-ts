import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isMethod } from "TSTransformer/util/isMethod";
import { isValidMethodIndexWithoutCall } from "TSTransformer/util/isValidMethodIndexWithoutCall";
import { offset } from "TSTransformer/util/offset";
import { skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol, isLuaTupleType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformElementAccessExpressionInner(
	state: TransformState,
	node: ts.ElementAccessExpression,
	expression: luau.Expression,
	argumentExpression: ts.Expression,
) {
	validateNotAnyType(state, node.expression);
	validateNotAnyType(state, node.argumentExpression);

	const symbol = getFirstDefinedSymbol(state, state.getType(node));
	if (symbol) {
		if (state.services.macroManager.getPropertyCallMacro(symbol)) {
			state.addDiagnostic(errors.noMacroWithoutCall(node));
			return luau.emptyId();
		}
	}

	const parent = skipUpwards(node).parent;
	if (!isValidMethodIndexWithoutCall(parent) && isMethod(state, node)) {
		state.addDiagnostic(errors.noIndexWithoutCall(node));
		return luau.emptyId();
	}

	if (ts.isPrototypeAccess(node)) {
		state.addDiagnostic(errors.noPrototype(node));
	}

	const constantValue = state.typeChecker.getConstantValue(node);
	if (constantValue !== undefined) {
		return typeof constantValue === "string" ? luau.string(constantValue) : luau.number(constantValue);
	}

	const [index, prereqs] = state.capture(() => transformExpression(state, argumentExpression));

	const expType = state.getType(node.expression);
	if (!luau.list.isEmpty(prereqs)) {
		// hack because wrapReturnIfLuaTuple will not wrap this, but now we need to!
		if (isLuaTupleType(state, expType)) {
			expression = luau.array([expression]);
		}

		expression = state.pushToVar(expression);
		state.prereqList(prereqs);
	}

	// LuaTuple<T> checks
	if (luau.isCall(expression) && isLuaTupleType(state, expType)) {
		// wrap in select() if it isn't the first value
		if (!luau.isNumberLiteral(index) || Number(index.value) !== 0) {
			expression = luau.call(luau.globals.select, [offset(index, 1), expression]);
		}
		// parentheses to trim off the rest of the values
		return luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
	}

	if (ts.isDeleteExpression(parent)) {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: addOneIfArrayType(state, expType, index),
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);
		return luau.nil();
	}

	return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfArrayType(state, expType, index),
	});
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	return transformOptionalChain(state, node);
}
