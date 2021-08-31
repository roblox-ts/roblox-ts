import ts from "typescript";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformAsExpression(state: TransformState, node: ts.AsExpression) {
	return transformExpression(state, node.expression);
}
