import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { TransformState } from "TSTransformer/TransformState";
import { createImportExpression } from "TSTransformer/util/createImportExpression";

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
	let uses = 0;
	if (defaultImport) {
		uses++;
	}
	if (namedBindings) {
		if (ts.isNamespaceImport(namedBindings)) {
			uses++;
		} else {
			uses += namedBindings.elements.length;
		}
	}
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
	}

	if (namedBindings) {
		// namespace import logic
		if (ts.isNamespaceImport(namedBindings)) {
			namedBindings.name;
			assert(false);
		} else {
			// named elements import logic
			for (const element of namedBindings.elements) {
				lua.list.pushList(
					statements,
					transformVariable(
						state,
						element.propertyName ?? element.name,
						lua.create(lua.SyntaxKind.PropertyAccessExpression, {
							expression: importExp,
							name: element.name.text,
						}),
					).statements,
				);
			}
		}
	}

	return statements;
}
