import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import ts from "typescript";

export function transformSpreadElement(state: TransformState, node: ts.SpreadElement) {
	// array literal is caught and handled separately in transformArrayLiteralExpression.ts
	assert(!ts.isArrayLiteralExpression(node.parent) && node.parent.arguments);
	if (node.parent.arguments[node.parent.arguments.length - 1] !== node) {
		DiagnosticService.addDiagnostic(errors.noPrecedingSpreadElement(node));
	}

	const expression = transformExpression(state, node.expression);

	const type = state.getType(node.expression);
	if (isDefinitelyType(state, type, undefined, isArrayType(state))) {
		return luau.call(luau.globals.unpack, [expression]);
	} else {
		const addIterableToArrayBuilder = getAddIterableToArrayBuilder(state, node.expression, type);
		const arrayId = state.pushToVar(luau.array(), "array");
		const lengthId = state.pushToVar(luau.number(0), "length");
		state.prereqList(addIterableToArrayBuilder(state, expression, arrayId, lengthId, 0, false));
		return luau.call(luau.globals.unpack, [arrayId]);
	}
}
