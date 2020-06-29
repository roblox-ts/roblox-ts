import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformAwaitExpression(state: TransformState, node: ts.AwaitExpression) {
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: state.TS("await"),
		args: luau.list.make(transformExpression(state, skipDownwards(node.expression))),
	});
}
