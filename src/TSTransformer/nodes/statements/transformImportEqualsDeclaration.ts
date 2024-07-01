import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformEntityName } from "TSTransformer/nodes/transformEntityName";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import ts from "typescript";

export function transformImportEqualsDeclaration(state: TransformState, node: ts.ImportEqualsDeclaration) {
	const { moduleReference } = node;
	if (ts.isExternalModuleReference(moduleReference)) {
		assert(ts.isStringLiteral(moduleReference.expression));
		const importExp = createImportExpression(state, node.getSourceFile(), moduleReference.expression);

		const statements = luau.list.make<luau.Statement>();

		const aliasSymbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(aliasSymbol);
		if (isSymbolOfValue(ts.skipAlias(aliasSymbol, state.typeChecker))) {
			const prereqs = new Prereqs();
			transformVariable(state, prereqs, node.name, importExp);
			luau.list.pushList(statements, prereqs.statements);
		}

		// ensure we emit something
		if (
			state.compilerOptions.verbatimModuleSyntax &&
			luau.list.isEmpty(statements) &&
			luau.isCallExpression(importExp)
		) {
			luau.list.push(statements, luau.create(luau.SyntaxKind.CallStatement, { expression: importExp }));
		}

		return statements;
	} else {
		// Identifier | QualifiedName
		// see: https://github.com/roblox-ts/roblox-ts/issues/1895
		const prereqs = new Prereqs();
		transformVariable(state, prereqs, node.name, transformEntityName(state, moduleReference));
		return prereqs.statements;
	}
}
