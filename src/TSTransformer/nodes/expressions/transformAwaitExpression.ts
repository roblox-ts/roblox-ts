import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformAwaitExpression(state: TransformState, node: ts.AwaitExpression) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: state.TS("await"),
		args: lua.list.make(transformExpression(state, skipDownwards(node.expression))),
	});
}
