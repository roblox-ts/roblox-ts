import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { createImportExpression } from "TSTransformer/util/createImportExpression";

export function transformImportExpression(state: TransformState, node: ts.CallExpression) {
	const moduleSpecifier = node.arguments[0];
	assert(moduleSpecifier);

	if (!ts.isStringLiteral(moduleSpecifier)) {
		state.addDiagnostic(errors.noNonStringModuleSpecifier(node));
		return luau.emptyId();
	}

	const importExpression = createImportExpression(state, node.getSourceFile(), moduleSpecifier);
	const id = luau.id("resolve");

	const funcExpression = luau.create(luau.SyntaxKind.FunctionExpression, {
		hasDotDotDot: false,
		parameters: luau.list.make(id),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(id, [importExpression]),
			}),
		),
	});

	return luau.call(luau.property(state.TS("Promise"), "new"), [funcExpression]);
}
