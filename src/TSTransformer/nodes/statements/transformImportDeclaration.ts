import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isReferenceOfValue } from "TSTransformer/util/symbolUtils";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";
import { Lazy } from "Shared/classes/Lazy";

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
	// no emit for type only
	const importClause = node.importClause;
	if (importClause && importClause.isTypeOnly) return lua.list.make<lua.Statement>();

	const statements = lua.list.make<lua.Statement>();

	const importExp = new Lazy(() => createImportExpression(state, node.getSourceFile(), node.moduleSpecifier));

	if (importClause) {
		const defaultImport = importClause.name;
		const namedBindings = importClause.namedBindings;

		// detect if we need to push to a new var or not
		const uses = countImportExpUses(state, importClause);
		if (uses > 1) {
			const id = lua.tempId();
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: id,
					right: importExp.get(),
				}),
			);
			importExp.set(id);
		}

		// default import logic
		if (defaultImport) {
			const aliasSymbol = state.typeChecker.getSymbolAtLocation(defaultImport);
			assert(aliasSymbol);
			if (isReferenceOfValue(state, aliasSymbol)) {
				const exportSymbol = state.typeChecker.getImmediateAliasedSymbol(aliasSymbol);
				assert(exportSymbol);

				const moduleFile = getSourceFileFromModuleSpecifier(state.typeChecker, node.moduleSpecifier);
				if (moduleFile && moduleFile.statements.some(v => ts.isExportAssignment(v) && v.isExportEquals)) {
					lua.list.pushList(statements, transformVariable(state, defaultImport, importExp.get()).statements);
				} else {
					lua.list.pushList(
						statements,
						transformVariable(
							state,
							defaultImport,
							lua.create(lua.SyntaxKind.PropertyAccessExpression, {
								expression: importExp.get(),
								name: "default",
							}),
						).statements,
					);
				}
			}
		}

		if (namedBindings) {
			// namespace import logic
			if (ts.isNamespaceImport(namedBindings)) {
				lua.list.pushList(statements, transformVariable(state, namedBindings.name, importExp.get()).statements);
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
									expression: importExp.get(),
									name: (element.propertyName ?? element.name).text,
								}),
							).statements,
						);
					}
				}
			}
		}
	}

	// ensure we emit something
	if (
		!importClause ||
		(state.compilerOptions.importsNotUsedAsValues === ts.ImportsNotUsedAsValues.Preserve &&
			lua.list.isEmpty(statements))
	) {
		const expression = importExp.get();
		assert(lua.isCallExpression(expression));
		lua.list.push(statements, lua.create(lua.SyntaxKind.CallStatement, { expression }));
	}

	return statements;
}
