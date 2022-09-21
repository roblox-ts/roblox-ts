import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import ts from "typescript";

export function transformPropertyDeclaration(
	state: TransformState,
	node: ts.PropertyDeclaration,
	name: luau.AnyIdentifier,
) {
	if (!ts.hasStaticModifier(node)) {
		return luau.list.make<luau.Statement>();
	}

	if (ts.isPrivateIdentifier(node.name)) {
		DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node));
		return luau.list.make<luau.Statement>();
	}

	if (!node.initializer) {
		return luau.list.make<luau.Statement>();
	}

	return luau.list.make(
		luau.create(luau.SyntaxKind.Assignment, {
			left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: name,
				index: transformPropertyName(state, node.name),
			}),
			operator: "=",
			right: transformExpression(state, node.initializer),
		}),
	);
}
