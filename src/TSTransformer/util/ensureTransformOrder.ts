import * as lua from "LuaAST";
import { findLastIndex } from "Shared/util/findLastIndex";
import { TransformState } from "TSTransformer";
import { pushToVar } from "TSTransformer/util/pushToVar";

/**
 * Takes an array of transformers `() => lua.Expression` and calls each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `lua.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 */
export function ensureTransformOrder<A extends lua.Expression, B extends lua.Expression>(
	state: TransformState,
	transformers: [() => A, () => B],
): [A, B];
export function ensureTransformOrder<A extends lua.Expression, B extends lua.Expression, C extends lua.Expression>(
	state: TransformState,
	transformers: [() => A, () => B, () => C],
): [A, B, C];
export function ensureTransformOrder<
	A extends lua.Expression,
	B extends lua.Expression,
	C extends lua.Expression,
	D extends lua.Expression
>(state: TransformState, transformers: [() => A, () => B, () => C, () => D]): [A, B, C, D];
export function ensureTransformOrder<T extends lua.Expression>(
	state: TransformState,
	transformers: Array<() => T>,
): Array<T>;
export function ensureTransformOrder(state: TransformState, transformers: Array<() => lua.Expression>) {
	const expressionInfoList = transformers.map(transformer => state.capturePrereqs(transformer));
	const lastArgWithPrereqsIndex = findLastIndex(expressionInfoList, info => !lua.list.isEmpty(info.statements));
	const result = new Array<lua.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const info = expressionInfoList[i];
		state.prereqList(info.statements);
		let expression = info.expression;
		if (i < lastArgWithPrereqsIndex && !lua.isTemporaryIdentifier(expression)) {
			expression = pushToVar(state, expression);
		}
		result.push(expression);
	}
	return result;
}
