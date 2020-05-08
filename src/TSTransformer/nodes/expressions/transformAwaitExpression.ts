import ts from "byots";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { skipDownwards } from "TSTransformer/util/nodeTraversal";

export function transformAwaitExpression(state: TransformState, node: ts.AwaitExpression) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: state.TS("await"),
		args: lua.list.make(transformExpression(state, skipDownwards(node.expression))),
	});
}
