import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { effectsCommute, getEffects, joinEffects, NO_EFFECTS } from "TSTransformer/util/evaluation/effects";
import ts from "typescript";

export function ensureTransformOrder(
	state: TransformState,
	prereqs: Prereqs,
	nodes: ReadonlyArray<ts.Expression>,
	transformer?: (state: TransformState, prereqs: Prereqs, node: ts.Expression) => luau.Expression,
): Array<luau.Expression>;
export function ensureTransformOrder<T extends ts.Node>(
	state: TransformState,
	prereqs: Prereqs,
	nodes: ReadonlyArray<T>,
	transformer: (state: TransformState, prereqs: Prereqs, node: T) => luau.Expression,
): Array<luau.Expression>;
export function ensureTransformOrder(
	state: TransformState,
	prereqs: Prereqs,
	nodes: ReadonlyArray<ts.Expression>,
	transformer: (
		state: TransformState,
		prereqs: Prereqs,
		node: ts.Expression,
	) => luau.Expression = transformExpression,
) {
	const expressionInfoList = nodes.map(node => {
		const expressionPrereqs = new Prereqs();
		const expression = transformer(state, expressionPrereqs, node);
		return { expression, prereqStatements: expressionPrereqs.statements };
	});
	const captures = new Array<boolean>(nodes.length).fill(false);
	// each capture becomes a prerequisite that earlier expressions must also cross
	let suffix = NO_EFFECTS;
	for (let i = expressionInfoList.length - 1; i >= 0; i--) {
		const { expression, prereqStatements } = expressionInfoList[i];
		const effects = getEffects(expression);
		captures[i] = !effectsCommute(effects, suffix);
		if (captures[i]) {
			suffix = joinEffects(effects, suffix);
		}
		suffix = joinEffects(getEffects(prereqStatements), suffix);
	}
	const result = new Array<luau.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const { expression, prereqStatements } = expressionInfoList[i];
		prereqs.pushList(prereqStatements);

		if (captures[i]) {
			result.push(prereqs.pushToVar(expression, "exp"));
		} else {
			result.push(expression);
		}
	}
	return result;
}
