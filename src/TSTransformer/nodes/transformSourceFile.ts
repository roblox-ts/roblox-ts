import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";

function getExportPair(state: TransformState, exportSymbol: ts.Symbol): [string, lua.Identifier] {
	const declaration = exportSymbol.getDeclarations()?.[0];
	if (declaration && ts.isExportSpecifier(declaration)) {
		return [declaration.name.text, transformIdentifierDefined(state, declaration.propertyName ?? declaration.name)];
	} else {
		const read = exportSymbol.name === "default" ? ts.skipAlias(exportSymbol, state.typeChecker) : exportSymbol;
		return [exportSymbol.name, lua.id(read.name)];
	}
}

function handleExports(state: TransformState, symbol: ts.Symbol, statements: lua.List<lua.Statement>) {
	let hasExportLet = false;
	const exportPairs = new Array<[string, lua.Identifier]>();
	if (!state.hasExportEquals) {
		for (const exportSymbol of state.getModuleExports(symbol)) {
			const originalSymbol = ts.skipAlias(exportSymbol, state.typeChecker);
			if (!!(originalSymbol.flags & ts.SymbolFlags.Value)) {
				if (isDefinedAsLet(state, originalSymbol)) {
					hasExportLet = true;
					continue;
				}
				exportPairs.push(getExportPair(state, exportSymbol));
			}
		}
	}

	if (state.hasExportEquals) {
		// local exports variable is created in transformExportAssignment
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.globals.exports,
			}),
		);
	} else if (hasExportLet) {
		// if there's an export let, we need to put `local exports = {}` at the top of the file and return it at the end
		lua.list.unshift(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.globals.exports,
				right: lua.map(),
			}),
		);
		for (const [exportKey, exportId] of exportPairs) {
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: lua.globals.exports,
						name: exportKey,
					}),
					right: exportId,
				}),
			);
		}
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.globals.exports,
			}),
		);
	} else {
		// only regular exports, we can do this as just returning an object at the bottom of the file
		const fields = lua.list.make<lua.MapField>();
		for (const [exportKey, exportId] of exportPairs) {
			lua.list.push(
				fields,
				lua.create(lua.SyntaxKind.MapField, {
					index: lua.string(exportKey),
					value: exportId,
				}),
			);
		}
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.create(lua.SyntaxKind.Map, {
					fields,
				}),
			}),
		);
	}
}

export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);
	state.setModuleIdBySymbol(symbol, lua.globals.exports);

	const statements = transformStatementList(state, node.statements);

	handleExports(state, symbol, statements);

	if (state.usesRuntimeLib) {
		lua.list.unshift(statements, state.createRuntimeLibImport());
	}

	return statements;
}
