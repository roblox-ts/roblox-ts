import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformTypeAssertionExpression(state: TransformState, node: ts.TypeAssertion | ts.NonNullExpression) {
	return transformExpression(state, node.expression);
}
