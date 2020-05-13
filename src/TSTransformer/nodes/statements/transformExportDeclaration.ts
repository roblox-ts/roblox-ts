import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { TransformState } from "TSTransformer/TransformState";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";

function countImportExpUses(exportClause?: ts.NamespaceExport | ts.NamedExports) {
	let uses = 0;
	if (exportClause && ts.isNamedExports(exportClause)) {
		uses += exportClause.elements.length;
	} else {
		uses += 1;
	}
	return uses;
}

function transformExportFrom(state: TransformState, node: ts.ExportDeclaration) {
	assert(node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier));

	const statements = lua.list.make<lua.Statement>();
	let importExp = createImportExpression(state, state.sourceFile, node.moduleSpecifier);

	const exportClause = node.exportClause;

	// detect if we need to push to a new var or not
	const uses = countImportExpUses(exportClause);
	if (uses > 1) {
		const importId = lua.tempId();
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: importId,
				right: importExp,
			}),
		);
		importExp = importId;
	}

	const moduleId = state.getModuleIdFromNode(node);
	if (exportClause) {
		if (ts.isNamedExports(exportClause)) {
			// export { a, b, c } from "./module";
			for (const element of exportClause.elements) {
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

	return statements;
}

export function transformExportDeclaration(state: TransformState, node: ts.ExportDeclaration) {
	if (node.isTypeOnly) return lua.list.make<lua.Statement>();

	if (node.moduleSpecifier) {
		return transformExportFrom(state, node);
	}

	const statements = lua.list.make<lua.Statement>();

	const exportClause = node.exportClause;
	assert(exportClause && ts.isNamedExports(exportClause));

	const exportId = state.getModuleIdFromNode(node);

	// export { a, b, c };
	for (const element of exportClause.elements) {
		element.propertyName;
		const aliasSymbol = state.typeChecker.getSymbolAtLocation(element.name);
		assert(aliasSymbol);
		const symbol = ts.skipAlias(aliasSymbol, state.typeChecker);
		if (!isDefinedAsLet(state, symbol)) {
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: exportId,
						name: element.name.text,
					}),
					right: transformIdentifierDefined(state, element.propertyName ?? element.name),
				}),
			);
		}
	}

	return statements;
}
