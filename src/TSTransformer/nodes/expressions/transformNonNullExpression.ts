import ts from "byots";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";

export function transformNonNullExpression(state: TransformState, node: ts.NonNullExpression) {
	return transformExpression(state, node.expression);
}
