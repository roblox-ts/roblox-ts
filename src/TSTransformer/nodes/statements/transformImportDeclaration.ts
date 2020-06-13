import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isReferenceOfValue } from "TSTransformer/util/symbolUtils";

function countImportExpUses(state: TransformState, importClause: ts.ImportClause) {
	let uses = 0;
	ts.forEachImportClauseDeclaration(importClause, declaration => {
		const aliasSymbol = state.typeChecker.getSymbolAtLocation(declaration.name ?? declaration);
		assert(aliasSymbol);
		if (isReferenceOfValue(state, aliasSymbol)) {
			uses++;
		}
	});
	return uses;
}

function isDefaultExport(exportDec: ts.Declaration) {
	if (ts.isExportAssignment(exportDec) && !exportDec.isExportEquals) {
		return true;
	}
	if (
		(ts.isFunctionDeclaration(exportDec) || ts.isClassDeclaration(exportDec)) &&
		!!(exportDec.modifierFlagsCache & ts.ModifierFlags.ExportDefault)
	) {
		return true;
	}
	return false;
}

export function transformImportDeclaration(state: TransformState, node: ts.ImportDeclaration) {
	assert(ts.isStringLiteral(node.moduleSpecifier));

	// no emit for type only
	const importClause = node.importClause;
	if (importClause && importClause.isTypeOnly) return lua.list.make<lua.Statement>();

	const statements = lua.list.make<lua.Statement>();

	let importExp: lua.IndexableExpression | undefined;

	if (!importClause) {
		importExp = createImportExpression(state, node.getSourceFile(), node.moduleSpecifier);
		assert(lua.isCallExpression(importExp));
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: importExp,
			}),
		);
		return statements;
	}

	const defaultImport = importClause.name;
	const namedBindings = importClause.namedBindings;

	// detect if we need to push to a new var or not
	const uses = countImportExpUses(state, importClause);
	if (uses === 1) {
		importExp = createImportExpression(state, node.getSourceFile(), node.moduleSpecifier);
	} else if (uses > 1) {
		const importExp = lua.tempId();
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: importExp,
				right: importExp,
			}),
		);
	}

	if (!importExp) {
		return statements;
	}

	// default import logic
	if (defaultImport) {
		const aliasSymbol = state.typeChecker.getSymbolAtLocation(defaultImport);
		assert(aliasSymbol);
		if (isReferenceOfValue(state, aliasSymbol)) {
			const exportSymbol = state.typeChecker.getImmediateAliasedSymbol(aliasSymbol);
			assert(exportSymbol);
			if (exportSymbol.valueDeclaration && isDefaultExport(exportSymbol.valueDeclaration)) {
				lua.list.pushList(
					statements,
					transformVariable(
						state,
						defaultImport,
						lua.create(lua.SyntaxKind.PropertyAccessExpression, {
							expression: importExp,
							name: "default",
						}),
					).statements,
				);
			} else {
				lua.list.pushList(statements, transformVariable(state, defaultImport, importExp).statements);
			}
		}
	}

	if (namedBindings) {
		// namespace import logic
		if (ts.isNamespaceImport(namedBindings)) {
			lua.list.pushList(statements, transformVariable(state, namedBindings.name, importExp).statements);
		} else {
			// named elements import logic
			for (const element of namedBindings.elements) {
				const aliasSymbol = state.typeChecker.getSymbolAtLocation(element.name);
				assert(aliasSymbol);

				if (isReferenceOfValue(state, aliasSymbol)) {
					lua.list.pushList(
						statements,
						transformVariable(
							state,
							element.name,
							lua.create(lua.SyntaxKind.PropertyAccessExpression, {
								expression: importExp,
								name: (element.propertyName ?? element.name).text,
							}),
						).statements,
					);
				}
			}
		}
	}

	// ensure we emit something
	if (
		state.compilerOptions.importsNotUsedAsValues === ts.ImportsNotUsedAsValues.Preserve &&
		lua.list.isEmpty(statements)
	) {
		assert(lua.isCallExpression(importExp));
		lua.list.push(statements, lua.create(lua.SyntaxKind.CallStatement, { expression: importExp }));
	}

	return statements;
}
