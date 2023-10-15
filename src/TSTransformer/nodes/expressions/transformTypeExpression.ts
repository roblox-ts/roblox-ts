import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformTypeExpression(
	state: TransformState,
	node:
		| ts.AsExpression
		| ts.NonNullExpression
		| ts.SatisfiesExpression
		| ts.TypeAssertion
		| ts.ExpressionWithTypeArguments,
) {
	return transformExpression(state, node.expression);
}
