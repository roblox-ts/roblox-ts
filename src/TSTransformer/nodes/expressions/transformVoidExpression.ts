import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformVoidExpression(state: TransformState, node: ts.VoidExpression) {
	state.prereqList(transformExpressionStatementInner(state, skipDownwards(node.expression)));
	return luau.create(luau.SyntaxKind.NilLiteral, {});
}
