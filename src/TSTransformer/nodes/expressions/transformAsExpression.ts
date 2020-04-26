import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";

export function transformAsExpression(state: TransformState, node: ts.AsExpression) {
	return transformExpression(state, node.expression);
}
