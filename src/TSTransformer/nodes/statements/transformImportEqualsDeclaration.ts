import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import ts from "typescript";

export function transformImportEqualsDeclaration(state: TransformState, node: ts.ImportEqualsDeclaration) {
	if (ts.isExternalModuleReference(node.moduleReference)) {
		assert(ts.isStringLiteral(node.moduleReference.expression));
		const importExp = createImportExpression(state, node.getSourceFile(), node.moduleReference.expression, false);

		const statements = luau.list.make<luau.Statement>();

		const aliasSymbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(aliasSymbol);
		if (isSymbolOfValue(ts.skipAlias(aliasSymbol, state.typeChecker))) {
			luau.list.pushList(statements, transformVariable(state, node.name, importExp)[1]);
		}

		// ensure we emit something
		if (
			state.compilerOptions.importsNotUsedAsValues === ts.ImportsNotUsedAsValues.Preserve &&
			luau.list.isEmpty(statements) &&
			luau.isCallExpression(importExp)
		) {
			luau.list.push(statements, luau.create(luau.SyntaxKind.CallStatement, { expression: importExp }));
		}

		return statements;
	} else {
		// Identifier | QualifiedName
		// See: https://github.com/roblox-ts/roblox-ts/issues/1895
		assert(false, "Identifier and QualifiedName are not implemented for ImportEqualsDeclaration!");
	}
}
