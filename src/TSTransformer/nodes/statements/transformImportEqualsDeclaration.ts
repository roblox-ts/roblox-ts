import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import ts from "typescript";

function transformEntityName(state: TransformState, node: ts.EntityName) {
	return ts.isIdentifier(node) ? transformIdentifierDefined(state, node) : transformQualifiedName(state, node);
}

function transformQualifiedName(state: TransformState, node: ts.QualifiedName): luau.PropertyAccessExpression {
	return luau.property(transformEntityName(state, node.left), node.right.text);
}

export function transformImportEqualsDeclaration(state: TransformState, node: ts.ImportEqualsDeclaration) {
	const { moduleReference } = node;
	if (ts.isExternalModuleReference(moduleReference)) {
		assert(ts.isStringLiteral(moduleReference.expression));
		const importExp = createImportExpression(state, node.getSourceFile(), moduleReference.expression);

		const statements = luau.list.make<luau.Statement>();

		const aliasSymbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(aliasSymbol);
		if (isSymbolOfValue(ts.skipAlias(aliasSymbol, state.typeChecker))) {
			luau.list.pushList(
				statements,
				state.capturePrereqs(() => transformVariable(state, node.name, importExp)),
			);
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
		// see: https://github.com/roblox-ts/roblox-ts/issues/1895
		return state.capturePrereqs(() =>
			transformVariable(state, node.name, transformEntityName(state, moduleReference)),
		);
	}
}
