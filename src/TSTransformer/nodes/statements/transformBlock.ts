import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/util/transformStatementList";
import ts from "typescript";

export function transformBlock(state: TransformState, node: ts.Block) {
	return lua.list.make(
		lua.create(lua.SyntaxKind.DoStatement, {
			statements: transformStatementList(state, node.statements),
		}),
	);
}
