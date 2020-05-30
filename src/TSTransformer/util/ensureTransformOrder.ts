import ts from "byots";
import * as lua from "LuaAST";
import { findLastIndex } from "Shared/util/findLastIndex";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";

/**
 * Takes an array of `ts.Expression` and transforms each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `lua.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 */
export function ensureTransformOrder(
	state: TransformState,
	expressions: ReadonlyArray<ts.Expression>,
	transformer: (
		state: TransformState,
		expression: ts.Expression,
		index: number,
	) => lua.Expression = transformExpression,
) {
	const expressionInfoList = expressions.map((exp, index) => state.capture(() => transformer(state, exp, index)));
	const lastArgWithPrereqsIndex = findLastIndex(expressionInfoList, info => !lua.list.isEmpty(info.statements));
	const result = new Array<lua.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const info = expressionInfoList[i];
		state.prereqList(info.statements);

		let isConstVar = false;
		const exp = expressions[i];
		if (ts.isIdentifier(exp)) {
			const symbol = state.typeChecker.getSymbolAtLocation(exp);
			if (symbol && !isDefinedAsLet(state, symbol)) {
				isConstVar = true;
			}
		}

		let expression = info.expression;
		if (
			i < lastArgWithPrereqsIndex &&
			!lua.isSimplePrimitive(expression) &&
			!lua.isTemporaryIdentifier(expression) &&
			!isConstVar
		) {
			expression = state.pushToVar(expression);
		}
		result.push(expression);
	}
	return result;
}
