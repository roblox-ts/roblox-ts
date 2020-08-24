import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformTypeAssertion(state: TransformState, node: ts.TypeAssertion) {
	return transformExpression(state, node.expression);
}
