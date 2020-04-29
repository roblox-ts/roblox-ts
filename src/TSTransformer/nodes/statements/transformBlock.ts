import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";

export function transformBlock(state: TransformState, node: ts.Block) {
	return lua.list.make(
		lua.create(lua.SyntaxKind.DoStatement, {
			statements: transformStatementList(state, node.statements),
		}),
	);
}
