import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformSpreadElement(state: TransformState, node: ts.SpreadElement) {
	validateNotAnyType(state, node.expression);

	assert(!ts.isArrayLiteralExpression(node.parent) && node.parent.arguments);
	if (node.parent.arguments[node.parent.arguments.length - 1] !== node) {
		state.addDiagnostic(diagnostics.noPrecedingSpreadElement(node));
	}

	assert(isDefinitelyType(state.getType(node.expression), t => isArrayType(state, t)));

	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.unpack,
		args: luau.list.make(transformExpression(state, node.expression)),
	});
}
