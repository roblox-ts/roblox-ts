import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { isArrayType } from "TSTransformer/util/types";

export function transformSpreadElement(state: TransformState, node: ts.SpreadElement) {
	assert(ts.isCallExpression(node.parent));
	if (node.parent.arguments[node.parent.arguments.length - 1] !== node) {
		state.addDiagnostic(diagnostics.noPrecedingSpreadElement(node));
	}

	assert(isArrayType(state, state.getType(node.expression)));

	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.unpack,
		args: lua.list.make(transformExpression(state, node.expression)),
	});
}
