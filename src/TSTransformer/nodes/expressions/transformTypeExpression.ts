import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformTypeExpression(
	state: TransformState,
	prereqs: Prereqs,
	node:
		| ts.AsExpression
		| ts.NonNullExpression
		| ts.SatisfiesExpression
		| ts.TypeAssertion
		| ts.ExpressionWithTypeArguments,
) {
	return transformExpression(state, prereqs, node.expression);
}
