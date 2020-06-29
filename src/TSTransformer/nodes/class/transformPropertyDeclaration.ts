import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { Pointer } from "TSTransformer/util/pointer";

export function transformPropertyDeclaration(
	state: TransformState,
	node: ts.PropertyDeclaration,
	ptr: Pointer<luau.AnyIdentifier>,
) {
	if (!ts.hasStaticModifier(node)) {
		return luau.list.make<luau.Statement>();
	}

	if (ts.isPrivateIdentifier(node.name)) {
		state.addDiagnostic(diagnostics.noPrivateIdentifier(node));
		return luau.list.make<luau.Statement>();
	}

	if (!node.initializer) {
		return luau.list.make<luau.Statement>();
	}

	return luau.list.make(
		luau.create(luau.SyntaxKind.Assignment, {
			left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: ptr.value,
				index: transformObjectKey(state, node.name),
			}),
			operator: "=",
			right: transformExpression(state, node.initializer),
		}),
	);
}
