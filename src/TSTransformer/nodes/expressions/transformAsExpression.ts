import ts from "byots";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";

export function transformAsExpression(state: TransformState, node: ts.AsExpression) {
	return transformExpression(state, node.expression);
}
