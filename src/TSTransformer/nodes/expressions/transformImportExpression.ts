import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer/classes/TransformState";
import { createImportExpression } from "TSTransformer/util/createImportExpression";

export function transformImportExpression(state: TransformState, node: ts.CallExpression) {
	const moduleSpecifier = node.arguments[0];

	if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
		state.addDiagnostic(errors.noNonStringModuleSpecifier(node));
		return luau.emptyId();
	}

	const importExpression = createImportExpression(state, node.getSourceFile(), moduleSpecifier);
	const resolveId = luau.id("resolve");

	return luau.call(luau.property(state.TS("Promise"), "new"), [
		luau.create(luau.SyntaxKind.FunctionExpression, {
			hasDotDotDot: false,
			parameters: luau.list.make(resolveId),
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(resolveId, [importExpression]),
				}),
			),
		}),
	]);
}
