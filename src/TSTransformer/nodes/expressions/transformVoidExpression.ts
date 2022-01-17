import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformVoidExpression(state: TransformState, node: ts.VoidExpression) {
	state.prereqList(transformExpressionStatementInner(state, skipDownwards(node.expression)));
	return luau.create(luau.SyntaxKind.NilLiteral, {});
}
