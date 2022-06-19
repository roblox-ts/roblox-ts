import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { cleanModuleName } from "TSTransformer/util/cleanModuleName";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import ts from "typescript";

function isExportSpecifierValue(state: TransformState, element: ts.ExportSpecifier) {
	if (element.isTypeOnly) {
		return false;
	}

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
		const moduleName = node.moduleSpecifier.text.split("/");
		importExp = luau.tempId(cleanModuleName(moduleName[moduleName.length - 1]));
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
							left: luau.property(moduleId, element.name.text),
							operator: "=",
							right: luau.property(importExp, (element.propertyName ?? element.name).text),
						}),
					);
				}
			}
		} else {
			// export * as foo from "./module";
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.property(moduleId, exportClause.name.text),
					operator: "=",
					right: importExp,
				}),
			);
		}
	} else {
		// export * from "./module";
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				// importExp may be `nil` in .d.ts files, so default to `{}`
				// boolean `or` is safe, because importExp can only be a table if not `nil`
				expression: luau.binary(importExp, "or", luau.map()),
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
