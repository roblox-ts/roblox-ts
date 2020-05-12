import ts from "byots";
import * as lua from "LuaAST";
import { Pointer } from "Shared/types";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { TransformState } from "TSTransformer/TransformState";

export function transformClassProperty(
	state: TransformState,
	node: ts.PropertyDeclaration,
	ptr: Pointer<lua.AnyIdentifier>,
) {
	if (ts.isPrivateIdentifier(node.name)) {
		state.addDiagnostic(diagnostics.noPrivateIdentifier(node));
		return lua.list.make<lua.Statement>();
	}

	if (!node.initializer) {
		return lua.list.make<lua.Statement>();
	}

	return lua.list.make(
		lua.create(lua.SyntaxKind.Assignment, {
			left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
				expression: ptr.value,
				index: transformObjectKey(state, node.name),
			}),
			right: transformExpression(state, node.initializer),
		}),
	);
}
