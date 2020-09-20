import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";

export function transformImportEqualsDeclaration(state: TransformState, node: ts.ImportEqualsDeclaration) {
	if (ts.isExternalModuleReference(node.moduleReference)) {
		assert(ts.isStringLiteral(node.moduleReference.expression));
		const importExp = createImportExpression(state, node.getSourceFile(), node.moduleReference.expression);

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
		assert(false, "Identifier and QualifiedName are not implemented for ImportEqualsDeclaration!");
	}
}
