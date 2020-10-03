import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";

export function ensureTransformAndEvalutationOrder(
	state: TransformState,
	expressions: ReadonlyArray<ts.Expression>,
	transformer: (
		state: TransformState,
		expression: ts.Expression,
		index: number,
	) => luau.Expression = transformExpression,
): Array<luau.Expression> {
	return ensureTransformOrder(state, expressions, transformer).map(arg =>
		expressionMightMutate(arg) ? state.pushToVar(arg) : arg,
	);
}
