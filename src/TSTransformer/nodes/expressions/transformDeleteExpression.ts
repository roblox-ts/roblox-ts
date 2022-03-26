import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import ts from "typescript";

export function transformDeleteExpression(state: TransformState, node: ts.DeleteExpression) {
	// we just want the prereqs, deleting is done in the index expression transforms
	transformExpression(state, node.expression);
	return !isUsedAsStatement(node) ? luau.bool(true) : luau.none();
}
