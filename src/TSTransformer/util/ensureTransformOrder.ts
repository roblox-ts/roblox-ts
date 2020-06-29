import ts from "byots";
import luau from "LuauAST";
import { findLastIndex } from "Shared/util/findLastIndex";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";

/**
 * Takes an array of `ts.Expression` and transforms each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `luau.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 */
export function ensureTransformOrder(
	state: TransformState,
	expressions: ReadonlyArray<ts.Expression>,
	transformer: (
		state: TransformState,
		expression: ts.Expression,
		index: number,
	) => luau.Expression = transformExpression,
) {
	const expressionInfoList = expressions.map((exp, index) => state.capture(() => transformer(state, exp, index)));
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
			expression = state.pushToVar(expression);
		}
		result.push(expression);
	}
	return result;
}
