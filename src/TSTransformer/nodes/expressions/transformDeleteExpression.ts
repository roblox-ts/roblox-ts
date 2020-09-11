import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";

export function transformDeleteExpression(state: TransformState, node: ts.DeleteExpression) {
	// we just want the prereqs
	transformExpression(state, node.expression);
	return isUsedAsStatement(node) ? luau.nil() : luau.bool(true);
}
