import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { createImportExpression } from "TSTransformer/util/createImportExpression";

function countImportExpUses(state: TransformState, exportClause?: ts.NamespaceExport | ts.NamedExports) {
	let uses = 0;
	if (exportClause && ts.isNamedExports(exportClause)) {
		for (const element of exportClause.elements) {
			if (state.resolver.isReferencedAliasDeclaration(element)) {
				uses++;
			}
		}
	} else {
		uses++;
	}
	return uses;
}

function transformExportFrom(state: TransformState, node: ts.ExportDeclaration) {
	assert(node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier));

	const statements = lua.list.make<lua.Statement>();
	let importExp: lua.IndexableExpression | undefined;

	const exportClause = node.exportClause;

	// detect if we need to push to a new var or not
	const uses = countImportExpUses(state, exportClause);
	if (uses === 1) {
		importExp = createImportExpression(state, node.getSourceFile(), node.moduleSpecifier);
	} else if (uses > 1) {
		importExp = lua.tempId();
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: importExp as lua.TemporaryIdentifier,
				right: createImportExpression(state, node.getSourceFile(), node.moduleSpecifier),
			}),
		);
	}

	if (!importExp) {
		return statements;
	}

	const moduleId = state.getModuleIdFromNode(node);
	if (exportClause) {
		if (ts.isNamedExports(exportClause)) {
			// export { a, b, c } from "./module";
			for (const element of exportClause.elements) {
				if (state.resolver.isReferencedAliasDeclaration(element)) {
					lua.list.push(
						statements,
						lua.create(lua.SyntaxKind.Assignment, {
							left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
								expression: moduleId,
								name: element.name.text,
							}),
							right: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
								expression: importExp,
								name: element.name.text,
							}),
						}),
					);
				}
			}
		} else {
			// export * as foo from "./module";
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: moduleId,
						name: exportClause.name.text,
					}),
					right: importExp,
				}),
			);
		}
	} else {
		// export * from "./module";
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.pairs,
					args: lua.list.make(importExp),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: moduleId,
							index: keyId,
						}),
						right: valueId,
					}),
				),
			}),
		);
	}

	state.hasExportFrom = true;

	return statements;
}

export function transformExportDeclaration(state: TransformState, node: ts.ExportDeclaration) {
	if (node.isTypeOnly) return lua.list.make<lua.Statement>();

	if (node.moduleSpecifier) {
		return transformExportFrom(state, node);
	}

	return lua.list.make<lua.Statement>();
}
