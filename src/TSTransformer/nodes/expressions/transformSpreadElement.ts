import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { tryHandleVarArgsArraySpread } from "TSTransformer/util/varArgsOptimization";
import ts from "typescript";

function simplifyUnpackOfArray(expression: luau.Expression) {
	if (!luau.isArray(expression)) return;
	const { members } = expression;
	if (members.head === undefined) return;
	if (members.head === members.tail) {
		return members.head.value;
	}
	// TODO ideally we should be able to return a list of expressions (members), but currently this function is expected to return a single expression
}

export function transformSpreadElement(state: TransformState, node: ts.SpreadElement) {
	validateNotAnyType(state, node.expression);

	const list = ts.isArrayLiteralExpression(node.parent) ? node.parent.elements : node.parent.arguments;
	assert(list);
	if (list[list.length - 1] !== node) {
		DiagnosticService.addDiagnostic(errors.noPrecedingSpreadElement(node));
	}

	return transformSpreadElementNoCheck(state, node);
}

export function transformSpreadElementNoCheck(state: TransformState, node: ts.SpreadElement) {
	const expression = transformExpression(state, node.expression);

	const type = state.getType(node.expression);
	if (isDefinitelyType(type, isArrayType(state))) {
		return (
			tryHandleVarArgsArraySpread(state, node) ??
			simplifyUnpackOfArray(expression) ??
			luau.call(luau.globals.unpack, [expression])
		);
	} else {
		const addIterableToArrayBuilder = getAddIterableToArrayBuilder(state, node.expression, type);
		const arrayId = state.pushToVar(luau.array(), "array");
		const lengthId = state.pushToVar(luau.number(0), "length");
		state.prereqList(addIterableToArrayBuilder(state, expression, arrayId, lengthId, 0, false));
		return luau.call(luau.globals.unpack, [arrayId]);
	}
}
