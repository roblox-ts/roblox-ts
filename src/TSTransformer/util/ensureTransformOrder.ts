import luau from "@roblox-ts/luau-ast";
import { findLastIndex } from "Shared/util/findLastIndex";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import ts from "typescript";

/**
 * Takes an array of `ts.Expression` and transforms each, capturing prereqs. Returns the transformed nodes.
 * Ensures the `luau.Expression` nodes execute in the same order as the `ts.Expression` nodes.
 */
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
		return [expression, expressionPrereqs.statements] as const;
	});
	const lastArgWithPrereqsIndex = findLastIndex(expressionInfoList, ([, prereqs]) => !luau.list.isEmpty(prereqs));
	const result = new Array<luau.Expression>();
	for (let i = 0; i < expressionInfoList.length; i++) {
		const [expression, expressionPrereqs] = expressionInfoList[i];
		prereqs.prereqList(expressionPrereqs);

		let isConstVar = false;
		const exp = nodes[i];
		if (ts.isIdentifier(exp)) {
			const symbol = state.typeChecker.getSymbolAtLocation(exp);
			if (symbol && !isSymbolMutable(state, symbol)) {
				isConstVar = true;
			}
		}

		if (
			i < lastArgWithPrereqsIndex &&
			!luau.isSimplePrimitive(expression) &&
			!luau.isTemporaryIdentifier(expression) &&
			!isConstVar
		) {
			result.push(prereqs.pushToVar(expression, "exp"));
		} else {
			result.push(expression);
		}
	}
	return result;
}
