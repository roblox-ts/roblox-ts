import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformSpreadElement(state: TransformState, node: ts.SpreadElement) {
	validateNotAnyType(state, node.expression);

	// array literal is caught and handled separately in transformArrayLiteralExpression.ts
	assert(!ts.isArrayLiteralExpression(node.parent) && node.parent.arguments);
	if (node.parent.arguments[node.parent.arguments.length - 1] !== node) {
		state.addDiagnostic(errors.noPrecedingSpreadElement(node));
	}

	const expression = transformExpression(state, node.expression);

	const type = state.getType(node.expression);
	if (isDefinitelyType(type, t => isArrayType(state, t))) {
		return luau.call(luau.globals.unpack, [expression]);
	} else {
		const addIterableToArrayBuilder = getAddIterableToArrayBuilder(state, node.expression, type);
		const arrayId = state.pushToVar(luau.array());
		const lengthId = state.pushToVar(luau.number(0));
		state.prereqList(addIterableToArrayBuilder(state, expression, arrayId, lengthId));
		return luau.call(luau.globals.unpack, [arrayId]);
	}
}
