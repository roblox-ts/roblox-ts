import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { effectsCommute, getEffects, joinEffects, NO_EFFECTS } from "TSTransformer/util/evaluation/effects";
import ts from "typescript";

export function ensureTransformOrder(
	state: TransformState,
	nodes: ReadonlyArray<ts.Expression>,
	transformer?: (state: TransformState, node: ts.Expression) => luau.Expression,
): Array<luau.Expression>;
export function ensureTransformOrder<T extends ts.Node>(
	state: TransformState,
	nodes: ReadonlyArray<T>,
	transformer: (state: TransformState, node: T) => luau.Expression,
): Array<luau.Expression>;
export function ensureTransformOrder(
	state: TransformState,
	nodes: ReadonlyArray<ts.Expression>,
	transformer: (state: TransformState, node: ts.Expression) => luau.Expression = transformExpression,
) {
	const expressionInfoList = nodes.map(node => state.capture(() => transformer(state, node)));
	const captures = new Array<boolean>(nodes.length).fill(false);
	// each capture becomes a prerequisite that earlier expressions must also cross
	let suffix = NO_EFFECTS;
	for (let i = expressionInfoList.length - 1; i >= 0; i--) {
		const [expression, prereqs] = expressionInfoList[i];
		const effects = getEffects(expression);
		captures[i] = !effectsCommute(effects, suffix);
		if (captures[i]) {
			suffix = joinEffects(effects, suffix);
		}
		suffix = joinEffects(getEffects(prereqs), suffix);
	}
	const result = new Array<luau.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const [expression, prereqs] = expressionInfoList[i];
		state.prereqList(prereqs);

		if (captures[i]) {
			result.push(state.pushToVar(expression, "exp"));
		} else {
			result.push(expression);
		}
	}
	return result;
}
