import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformAwaitExpression(state: TransformState, node: ts.AwaitExpression) {
	return luau.call(state.TS("await"), [transformExpression(state, skipDownwards(node.expression))]);
}
