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

	let hasExports = false;
	let hasExportEquals = false;
	for (const statement of node.statements) {
		if (ts.isExportAssignment(statement)) {
			hasExports = true;
			if (statement.isExportEquals) {
				hasExportEquals = true;
			}
		} else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
			hasExports = true;
		}
		// this is safe because export equals cannot co-exist with other non-isTypeOnly exports
		if (hasExports) {
			break;
		}
	}

	if (hasExports) {
		if (!hasExportEquals) {
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
