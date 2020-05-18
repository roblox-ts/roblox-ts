import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformNonNullExpression(state: TransformState, node: ts.NonNullExpression) {
	return transformExpression(state, node.expression);
}
