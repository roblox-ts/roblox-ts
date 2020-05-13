import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";

export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);
	state.setModuleIdBySymbol(symbol, lua.globals.exports);

	const statements = transformStatementList(state, node.statements);

	if (state.hasExports) {
		if (!state.hasExportEquals) {
			lua.list.unshift(
				statements,
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: lua.globals.exports,
					right: lua.map(),
				}),
			);
		}
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.globals.exports,
			}),
		);
	}

	if (state.usesRuntimeLib) {
		lua.list.unshift(statements, state.createRuntimeLibImport());
	}

	return statements;
}
