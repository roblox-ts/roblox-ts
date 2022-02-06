import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addIndexDiagnostics } from "TSTransformer/util/addIndexDiagnostics";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getConstantValueLiteral } from "TSTransformer/util/getConstantValueLiteral";
import { offset } from "TSTransformer/util/offset";
import { skipUpwards } from "TSTransformer/util/traversal";
import { isDefinitelyType, isLuaTupleType } from "TSTransformer/util/types";
import ts from "typescript";

export function transformElementAccessExpressionInner(
	state: TransformState,
	node: ts.ElementAccessExpression,
	expression: luau.Expression,
	argumentExpression: ts.Expression,
) {
	const expType = state.typeChecker.getNonNullableType(state.getType(node.expression));
	addIndexDiagnostics(state, node, expType);

	const constantValue = getConstantValueLiteral(state, node);
	if (constantValue) {
		return constantValue;
	}

	const isLuaTuple = isDefinitelyType(state, expType, node.expression, isLuaTupleType(state));

	const [index, prereqs] = state.capture(() => transformExpression(state, argumentExpression));
	if (!luau.list.isEmpty(prereqs)) {
		// hack because wrapReturnIfLuaTuple will not wrap this, but now we need to!
		if (isLuaTuple) {
			expression = luau.array([expression]);
		}

		expression = state.pushToVar(expression, "exp");
		state.prereqList(prereqs);
	}

	// LuaTuple<T> checks
	if (luau.isCall(expression) && isLuaTuple) {
		if (!luau.isNumberLiteral(index) || Number(index.value) !== 0) {
			// not the first value => wrap in select()
			expression = luau.call(luau.globals.select, [offset(index, 1), expression]);
		} else {
			// parentheses to trim off the rest of the values
			expression = luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
		}
		return expression;
	}

	if (ts.isDeleteExpression(skipUpwards(node).parent)) {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: addOneIfArrayType(state, expType, index, node.expression),
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);
		return luau.nil();
	}

	return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfArrayType(state, expType, index, node.expression),
	});
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	return transformOptionalChain(state, node);
}
