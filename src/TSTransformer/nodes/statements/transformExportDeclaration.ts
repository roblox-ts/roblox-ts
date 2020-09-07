import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";

function isExportSpecifierValue(state: TransformState, element: ts.ExportSpecifier) {
	if (state.resolver.isReferencedAliasDeclaration(element)) {
		return true;
	}

	const aliasSymbol = state.typeChecker.getSymbolAtLocation(element.name);
	if (aliasSymbol && isSymbolOfValue(ts.skipAlias(aliasSymbol, state.typeChecker))) {
		return true;
	}

	return false;
}

function countImportExpUses(state: TransformState, exportClause?: ts.NamespaceExport | ts.NamedExports) {
	let uses = 0;
	if (exportClause && ts.isNamedExports(exportClause)) {
		for (const element of exportClause.elements) {
			if (isExportSpecifierValue(state, element)) {
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

	const statements = luau.list.make<luau.Statement>();
	let importExp: luau.IndexableExpression | undefined;

	const exportClause = node.exportClause;

	// detect if we need to push to a new var or not
	const uses = countImportExpUses(state, exportClause);
	if (uses === 1) {
		importExp = createImportExpression(state, node.getSourceFile(), node.moduleSpecifier);
	} else if (uses > 1) {
		importExp = luau.tempId();
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: importExp as luau.TemporaryIdentifier,
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
				if (isExportSpecifierValue(state, element)) {
					luau.list.push(
						statements,
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
								expression: moduleId,
								name: element.name.text,
							}),
							operator: "=",
							right: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
								expression: importExp,
								name: element.name.text,
							}),
						}),
					);
				}
			}
		} else {
			// export * as foo from "./module";
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
						expression: moduleId,
						name: exportClause.name.text,
					}),
					operator: "=",
					right: importExp,
				}),
			);
		}
	} else {
		// export * from "./module";
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.pairs,
					args: luau.list.make(importExp),
				}),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: moduleId,
							index: keyId,
						}),
						operator: "=",
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
	if (node.isTypeOnly) return luau.list.make<luau.Statement>();

	if (node.moduleSpecifier) {
		return transformExportFrom(state, node);
	}

	return luau.list.make<luau.Statement>();
}
