import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { TransformState } from "TSTransformer/TransformState";
import { createImportExpression } from "TSTransformer/util/createImportExpression";

function countImportExpUses(importClause: ts.ImportClause) {
	let uses = 0;
	if (importClause.name) {
		uses++;
	}
	if (importClause.namedBindings) {
		if (ts.isNamespaceImport(importClause.namedBindings)) {
			uses++;
		} else {
			uses += importClause.namedBindings.elements.length;
		}
	}
	return uses;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFlags<T extends number>(flags: T, from: any) {
	const results = new Array<string>();
	for (const [flagName, flagValue] of Object.entries(from)) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (!!(flags & (flagValue as any))) {
			results.push(flagName);
		}
	}
	return results;
}

export function transformImportDeclaration(state: TransformState, node: ts.ImportDeclaration) {
	assert(ts.isStringLiteral(node.moduleSpecifier));

	// no emit for type only
	const importClause = node.importClause;
	if (importClause && importClause.isTypeOnly) return lua.list.make<lua.Statement>();

	const statements = lua.list.make<lua.Statement>();

	let importExp: lua.IndexableExpression = createImportExpression(state, node.getSourceFile(), node.moduleSpecifier);

	if (!importClause) {
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
	const uses = countImportExpUses(importClause);
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

	// default import logic
	if (defaultImport) {
		const aliasSymbol = state.typeChecker.getSymbolAtLocation(defaultImport);
		assert(aliasSymbol);
		const exportSymbol = state.typeChecker.getImmediateAliasedSymbol(aliasSymbol);
		assert(exportSymbol);
		const exportDec = exportSymbol.valueDeclaration;
		if (exportDec && ts.isExportAssignment(exportDec) && !exportDec.isExportEquals) {
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

	if (namedBindings) {
		// namespace import logic
		if (ts.isNamespaceImport(namedBindings)) {
			lua.list.pushList(statements, transformVariable(state, namedBindings.name, importExp).statements);
		} else {
			// named elements import logic
			for (const element of namedBindings.elements) {
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

	// ensure we emit something
	if (lua.list.isEmpty(statements)) {
		assert(lua.isCallExpression(importExp));
		lua.list.push(statements, lua.create(lua.SyntaxKind.CallStatement, { expression: importExp }));
	}

	return statements;
}
