import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { decideOrderedCaptures, OrderedOperand, tagValueRegion } from "TSTransformer/util/effects";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import ts from "typescript";

/**
 * Takes an array of `ts.Expression` and transforms each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `luau.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 *
 * TypeScript evaluates operands strictly left-to-right, interleaving each operand's
 * side effects with its evaluation. An operand only needs to be captured into a temporary
 * at its original position when deferring it to the consumption point is observable —
 * see `decideOrderedCaptures`.
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
	const operands: Array<OrderedOperand> = nodes.map(node => {
		const [expression, prereqs] = state.capture(() => transformer(state, node));
		const operandNode = ts.isExpression(node) ? node : undefined;
		if (operandNode) {
			// record the operand value's heap region so member accesses through it (in
			// emitted code with no source node of its own) classify by base
			tagValueRegion(state, expression, operandNode);
		}
		return { expressions: [expression], prereqs, node: operandNode };
	});

	const captures = decideOrderedCaptures(state, operands);

	const result = new Array<luau.Expression>();
	for (let i = 0; i < operands.length; i++) {
		const { expressions, prereqs } = operands[i];
		state.prereqList(prereqs);

		if (captures[i][0]) {
			result.push(state.pushToVar(expressions[0], valueToIdStr(expressions[0]) || "exp"));
		} else {
			result.push(expressions[0]);
		}
	}
	return result;
}
