import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformThrowStatement(state: TransformState, node: ts.ThrowStatement) {
	const args = lua.list.make<lua.Expression>();
	if (node.expression !== undefined) {
		lua.list.push(args, transformExpression(state, node.expression));
	}

	return lua.list.make(
		lua.create(lua.SyntaxKind.CallStatement, {
			expression: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.error,
				args,
			}),
		}),
	);
}
