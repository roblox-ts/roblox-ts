import ts from "byots";
import * as lua from "LuaAST";
import { Lazy } from "Shared/classes/Lazy";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";

function countImportExpUses(state: TransformState, importClause: ts.ImportClause) {
	let uses = 0;

	if (importClause.name) {
		if (state.resolver.isReferencedAliasDeclaration(importClause)) {
			uses++;
		}
	}

	if (importClause.namedBindings) {
		if (ts.isNamespaceImport(importClause.namedBindings)) {
			uses++;
		} else {
			for (const element of importClause.namedBindings.elements) {
				if (state.resolver.isReferencedAliasDeclaration(element)) {
					uses++;
				}
			}
		}
	}

	return uses;
}

export function transformImportDeclaration(state: TransformState, node: ts.ImportDeclaration) {
	// no emit for type only
	const importClause = node.importClause;
	if (importClause && importClause.isTypeOnly) return lua.list.make<lua.Statement>();

	const statements = lua.list.make<lua.Statement>();

	const importExp = new Lazy(() => createImportExpression(state, node.getSourceFile(), node.moduleSpecifier));

	if (importClause) {
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
		if (importClause.name) {
			if (state.resolver.isReferencedAliasDeclaration(importClause)) {
				const moduleFile = getSourceFileFromModuleSpecifier(state.typeChecker, node.moduleSpecifier);
				if (moduleFile && moduleFile.statements.some(v => ts.isExportAssignment(v) && v.isExportEquals)) {
					lua.list.pushList(
						statements,
						transformVariable(state, importClause.name, importExp.get()).statements,
					);
				} else {
					lua.list.pushList(
						statements,
						transformVariable(
							state,
							importClause.name,
							lua.create(lua.SyntaxKind.PropertyAccessExpression, {
								expression: importExp.get(),
								name: "default",
							}),
						).statements,
					);
				}
			}
		}

		if (importClause.namedBindings) {
			// namespace import logic
			if (ts.isNamespaceImport(importClause.namedBindings)) {
				lua.list.pushList(
					statements,
					transformVariable(state, importClause.namedBindings.name, importExp.get()).statements,
				);
			} else {
				// named elements import logic
				for (const element of importClause.namedBindings.elements) {
					if (state.resolver.isReferencedAliasDeclaration(element)) {
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
