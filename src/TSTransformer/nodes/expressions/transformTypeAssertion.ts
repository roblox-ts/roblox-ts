import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformTypeAssertion(state: TransformState, node: ts.TypeAssertion) {
	return transformExpression(state, node.expression);
}
