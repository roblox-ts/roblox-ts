import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { hasMultipleDeclarations } from "TSTransformer/util/hasMultipleDefinitions";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import { getAncestor } from "TSTransformer/util/traversal";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import ts from "typescript";

function isDeclarationOfNamespace(declaration: ts.Declaration) {
	if (declaration.modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword)) {
		return false;
	}

	if (ts.isModuleDeclaration(declaration) && ts.isInstantiatedModule(declaration, false)) {
		return true;
	} else if (ts.isFunctionDeclaration(declaration) && declaration.body) {
		return true;
	} else if (ts.isClassDeclaration(declaration)) {
		return true;
	}
	return false;
}

function getValueDeclarationStatement(symbol: ts.Symbol) {
	for (const declaration of symbol.getDeclarations() ?? []) {
		const statement = getAncestor(declaration, ts.isStatement);
		if (statement) {
			if (ts.isFunctionDeclaration(statement) && !statement.body) continue;
			if (ts.isTypeAliasDeclaration(statement)) continue;
			if (ts.isInterfaceDeclaration(statement)) continue;
			if (statement.modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword)) continue;
			return statement;
		}
	}
}

function transformNamespace(state: TransformState, name: ts.Identifier, body: ts.NamespaceBody) {
	const symbol = state.typeChecker.getSymbolAtLocation(name);
	assert(symbol);

	validateIdentifier(state, name);

	const nameExp = transformIdentifierDefined(state, name);

	const statements = luau.list.make<luau.Statement>();
	const doStatements = luau.list.make<luau.Statement>();

	const containerId = luau.tempId("container");
	state.setModuleIdBySymbol(symbol, containerId);

	if (state.isHoisted.get(symbol)) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: nameExp,
				operator: "=",
				right: luau.map(),
			}),
		);
	} else {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: nameExp,
				right: luau.map(),
			}),
		);
	}

	const moduleExports = state.getModuleExports(symbol);
	if (moduleExports.length > 0) {
		luau.list.push(
			doStatements,
			luau.create(luau.SyntaxKind.VariableDeclaration, { left: containerId, right: nameExp }),
		);
	}

	if (ts.isModuleBlock(body)) {
		const exportsMap = new Map<ts.Statement, Array<string>>();
		if (moduleExports.length > 0) {
			for (const exportSymbol of moduleExports) {
				const originalSymbol = ts.skipAlias(exportSymbol, state.typeChecker);
				if (isSymbolOfValue(originalSymbol) && !isDefinedAsLet(state, originalSymbol)) {
					const valueDeclarationStatement = getValueDeclarationStatement(exportSymbol);
					if (valueDeclarationStatement) {
						getOrSetDefault(exportsMap, valueDeclarationStatement, () => []).push(exportSymbol.name);
					}
				}
			}
		}
		luau.list.pushList(
			doStatements,
			transformStatementList(state, body.statements, {
				id: containerId,
				mapping: exportsMap,
			}),
		);
	} else {
		luau.list.pushList(doStatements, transformNamespace(state, body.name, body.body));
		luau.list.push(
			doStatements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.property(containerId, body.name.text),
				operator: "=",
				right: transformIdentifierDefined(state, body.name),
			}),
		);
	}

	luau.list.push(statements, luau.create(luau.SyntaxKind.DoStatement, { statements: doStatements }));

	return statements;
}

export function transformModuleDeclaration(state: TransformState, node: ts.ModuleDeclaration) {
	// type-only namespace
	if (!ts.isInstantiatedModule(node, false)) {
		return luau.list.make<luau.Statement>();
	}

	// disallow merging
	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (
		symbol &&
		hasMultipleDeclarations(
			state,
			symbol,
			declaration => isDeclarationOfNamespace(declaration),
			errors.noNamespaceMerging(node),
		)
	) {
		return luau.list.make<luau.Statement>();
	}

	// ts.StringLiteral is only in the case of `declare module "X" {}`? Should be filtered out above
	assert(!ts.isStringLiteral(node.name));
	assert(node.body && !ts.isIdentifier(node.body));
	// unsure how to filter out ts.JSDocNamespaceBody
	return transformNamespace(state, node.name, node.body as ts.NamespaceBody);
}
