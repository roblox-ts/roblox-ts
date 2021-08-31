import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformAsExpression(state: TransformState, node: ts.AsExpression) {
	return transformExpression(state, node.expression);
}
