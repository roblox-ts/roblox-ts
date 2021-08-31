import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformNonNullExpression(state: TransformState, node: ts.NonNullExpression) {
	return transformExpression(state, node.expression);
}
