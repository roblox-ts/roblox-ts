import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	commutes,
	PURE_SUMMARY,
	summarizeExpression,
	summarizeStatements,
	unionSummaries,
} from "TSTransformer/util/effects";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import ts from "typescript";

/**
 * Takes an array of `ts.Expression` and transforms each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `luau.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 *
 * TypeScript evaluates operands strictly left-to-right, interleaving each operand's
 * side effects with its evaluation. In the emitted Luau, every operand's prerequisite
 * statements run first and all result expressions are evaluated afterwards at the point
 * of consumption — so each result expression is implicitly deferred past every *later*
 * operand's prerequisite statements. An operand only needs to be captured into a
 * temporary at its original position when that deferral is observable, i.e. when the
 * operand's effect summary does not commute with the combined summary of the later
 * prerequisite statements.
 */
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

	// Decide captures right-to-left. `suffix` accumulates everything after operand i that
	// will run before a raw operand i's deferred consumption: later operands' prerequisite
	// statements, plus the evaluation of any later operand that is itself captured (its
	// pushToVar assignment executes at its original position, i.e. before operand i's raw
	// expression is finally consumed). A raw later operand contributes nothing — it stays at
	// the consumption point, after operand i's raw expression, matching TS order.
	const captures = new Array<boolean>(expressionInfoList.length);
	let suffix = PURE_SUMMARY;
	for (let i = expressionInfoList.length - 1; i >= 0; i--) {
		const [expression, prereqs] = expressionInfoList[i];
		const node = nodes[i];
		const operandSummary = summarizeExpression(state, expression, ts.isExpression(node) ? node : undefined);
		captures[i] = !commutes(operandSummary, suffix);
		if (captures[i]) {
			suffix = unionSummaries(operandSummary, suffix);
		}
		suffix = unionSummaries(summarizeStatements(state, prereqs), suffix);
	}

	const result = new Array<luau.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const [expression, prereqs] = expressionInfoList[i];
		state.prereqList(prereqs);

		if (captures[i]) {
			result.push(state.pushToVar(expression, valueToIdStr(expression) || "exp"));
		} else {
			result.push(expression);
		}
	}
	return result;
}
