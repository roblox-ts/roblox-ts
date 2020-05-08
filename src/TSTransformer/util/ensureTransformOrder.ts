import ts from "byots";
import * as lua from "LuaAST";
import { findLastIndex } from "Shared/util/findLastIndex";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

/**
 * Takes an array of `ts.Expression` and transforms each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `lua.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 */
export function ensureTransformOrder(state: TransformState, expressions: ReadonlyArray<ts.Expression>) {
	const expressionInfoList = expressions.map(exp => state.capturePrereqs(() => transformExpression(state, exp)));
	const lastArgWithPrereqsIndex = findLastIndex(expressionInfoList, info => !lua.list.isEmpty(info.statements));
	const result = new Array<lua.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const info = expressionInfoList[i];
		state.prereqList(info.statements);
		let expression = info.expression;
		if (
			i < lastArgWithPrereqsIndex &&
			!lua.isSimplePrimitive(expression) &&
			!lua.isTemporaryIdentifier(expression)
		) {
			expression = state.pushToVar(expression);
		}
		result.push(expression);
	}
	return result;
}
