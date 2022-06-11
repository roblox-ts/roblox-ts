import luau from "@roblox-ts/luau-ast";
import { findLastIndex } from "Shared/util/findLastIndex";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import ts from "typescript";

/**
 * Takes an array of `ts.Expression` and transforms each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `luau.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 */
export function ensureTransformOrder(state: TransformState, expressions: ReadonlyArray<ts.Expression>) {
	const expressionInfoList = expressions.map(exp => state.capture(() => transformExpression(state, exp)));
	const lastArgWithPrereqsIndex = findLastIndex(expressionInfoList, info => !luau.list.isEmpty(info[1]));
	const result = new Array<luau.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const info = expressionInfoList[i];
		state.prereqList(info[1]);

		let isConstVar = false;
		const exp = expressions[i];
		if (ts.isIdentifier(exp)) {
			const symbol = state.typeChecker.getSymbolAtLocation(exp);
			if (symbol && !isDefinedAsLet(state, symbol)) {
				isConstVar = true;
			}
		}

		let expression = info[0];
		if (
			i < lastArgWithPrereqsIndex &&
			!luau.isSimplePrimitive(expression) &&
			!luau.isTemporaryIdentifier(expression) &&
			!isConstVar
		) {
			expression = state.pushToVar(expression, "exp");
		}
		result.push(expression);
	}
	return result;
}
