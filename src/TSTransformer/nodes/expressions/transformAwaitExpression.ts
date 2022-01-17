import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformAwaitExpression(state: TransformState, node: ts.AwaitExpression) {
	return luau.call(state.TS(node, "await"), [transformExpression(state, skipDownwards(node.expression))]);
}
