import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";

export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	const statements = transformStatementList(state, node.statements);

	if (state.usesRuntimeLib) {
		lua.list.unshift(statements, state.createRuntimeLibImport());
	}

	return statements;
}
