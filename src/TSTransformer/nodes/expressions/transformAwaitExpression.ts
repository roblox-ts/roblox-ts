import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformAwaitExpression(state: TransformState, prereqs: Prereqs, node: ts.AwaitExpression) {
	return luau.call(state.TS(node, "await"), [transformExpression(state, prereqs, skipDownwards(node.expression))]);
}
