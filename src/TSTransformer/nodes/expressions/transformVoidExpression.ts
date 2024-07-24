import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformVoidExpression(state: TransformState, prereqs: Prereqs, node: ts.VoidExpression) {
	prereqs.prereqList(transformExpressionStatementInner(state, prereqs, skipDownwards(node.expression)));
	return luau.create(luau.SyntaxKind.NilLiteral, {});
}
