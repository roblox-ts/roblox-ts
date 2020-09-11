import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformDeleteExpression(state: TransformState, node: ts.DeleteExpression) {
	return transformExpression(state, node.expression);
}
