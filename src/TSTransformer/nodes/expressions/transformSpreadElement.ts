import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isArrayType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformSpreadElement(state: TransformState, node: ts.SpreadElement) {
	validateNotAnyType(state, node.expression);

	const parent = node.parent;
	assert(ts.isCallExpression(parent) || ts.isNewExpression(parent));
	assert(parent.arguments);
	if (parent.arguments[parent.arguments.length - 1] !== node) {
		state.addDiagnostic(diagnostics.noPrecedingSpreadElement(node));
	}

	assert(isArrayType(state, state.getType(node.expression)));

	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.unpack,
		args: lua.list.make(transformExpression(state, node.expression)),
	});
}
