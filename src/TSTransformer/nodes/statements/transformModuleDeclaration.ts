import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import { getAncestor } from "TSTransformer/util/traversal";

function hasMultipleInstantiations(symbol: ts.Symbol): boolean {
	let amtValueDeclarations = 0;
	for (const declaration of symbol.declarations) {
		if (ts.isModuleDeclaration(declaration) && ts.isInstantiatedModule(declaration, false)) {
			amtValueDeclarations++;
			if (amtValueDeclarations > 1) {
				return true;
			}
		}
	}
	return false;
}

function transformNamespace(state: TransformState, name: ts.Identifier, body: ts.NamespaceBody) {
	const symbol = state.typeChecker.getSymbolAtLocation(name);
	assert(symbol);

	const nameExp = transformIdentifierDefined(state, name);

	const statements = lua.list.make<lua.Statement>();
	const doStatements = lua.list.make<lua.Statement>();

	const containerId = lua.tempId();
	state.setModuleIdBySymbol(symbol, containerId);

	if (state.isHoisted.get(symbol)) {
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.Assignment, {
				left: nameExp,
				operator: "=",
				right: lua.map(),
			}),
		);
	} else {
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: nameExp,
				right: lua.map(),
			}),
		);
	}

	const moduleExports = state.getModuleExports(symbol);
	if (moduleExports.length > 0) {
		lua.list.push(
			doStatements,
			lua.create(lua.SyntaxKind.VariableDeclaration, { left: containerId, right: nameExp }),
		);
	}

	if (ts.isModuleBlock(body)) {
		const exportsMap = new Map<ts.Statement, Array<string>>();
		if (moduleExports.length > 0) {
			for (const exportSymbol of moduleExports) {
				const originalSymbol = ts.skipAlias(exportSymbol, state.typeChecker);
				if (isSymbolOfValue(originalSymbol) && !isDefinedAsLet(state, originalSymbol)) {
					const statement = getAncestor(exportSymbol.valueDeclaration, ts.isStatement);
					assert(statement);
					getOrSetDefault(exportsMap, statement, () => []).push(exportSymbol.name);
				}
			}
		}
		lua.list.pushList(
			doStatements,
			transformStatementList(state, body.statements, {
				id: containerId,
				mapping: exportsMap,
			}),
		);
	} else {
		lua.list.pushList(doStatements, transformNamespace(state, body.name, body.body));
		lua.list.push(
			doStatements,
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
					expression: containerId,
					name: body.name.text,
				}),
				operator: "=",
				right: transformIdentifierDefined(state, body.name),
			}),
		);
	}

	lua.list.push(statements, lua.create(lua.SyntaxKind.DoStatement, { statements: doStatements }));

	return statements;
}

export function transformModuleDeclaration(state: TransformState, node: ts.ModuleDeclaration) {
	// type-only namespace
	if (!ts.isInstantiatedModule(node, false)) {
		return lua.list.make<lua.Statement>();
	}

	// disallow merging
	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (symbol && hasMultipleInstantiations(symbol)) {
		state.addDiagnostic(diagnostics.noNamespaceMerging(node));
		return lua.list.make<lua.Statement>();
	}

	// ts.StringLiteral is only in the case of `declare module "X" {}`? Should be filtered out above
	assert(!ts.isStringLiteral(node.name));
	assert(node.body && !ts.isIdentifier(node.body));
	// unsure how to filter out ts.JSDocNamespaceBody
	return transformNamespace(state, node.name, node.body as ts.NamespaceBody);
}
