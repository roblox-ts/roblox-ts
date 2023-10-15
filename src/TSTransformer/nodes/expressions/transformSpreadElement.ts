import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformSpreadElement(state: TransformState, node: ts.SpreadElement) {
	validateNotAnyType(state, node.expression);

	// SpreadElement is only for ArrayLiteralExpression, CallExpression and NewExpression
	// array literal is caught and handled separately in transformArrayLiteralExpression.ts
	assert(!ts.isArrayLiteralExpression(node.parent) && node.parent.arguments);
	// so this function only actually deals with function call arguments
	const args = node.parent.arguments;
	const index = args.indexOf(node);
	// if not last element in the argument list
	if (index !== args.length - 1) {
		if (args.slice(index + 1).some(e => !ts.isSpreadElement(e))) {
			// diagnostic if any of the arguments after are not spreads
			// for example in `f(12, 2, ...a, 3)`
			DiagnosticService.addDiagnostic(errors.noPrecedingSpreadElement(node));
		}
		return luau.list.make();
	}

	const type = state.getType(node.expression);
	const expression = transformExpression(state, node.expression);

	let arrayId: luau.Expression;
	if (
		// the only argument to the call, or preceding argument not a spread
		(index === 0 || !ts.isSpreadElement(args[index - 1])) &&
		// and must work with regular `unpack(item)`
		isDefinitelyType(type, isArrayType(state))
	) {
		arrayId = expression;
	} else {
		arrayId = state.pushToVar(luau.array(), "array");
		const lengthId = state.pushToVar(luau.number(0), "length");
		for (let i = 0; i < args.length; i++) {
			const element = args[i];
			if (ts.isSpreadElement(element)) {
				const addIterableToArrayBuilder = getAddIterableToArrayBuilder(state, element.expression, type);
				const shouldUpdateLengthId = i < args.length - 1;
				state.prereqList(
					addIterableToArrayBuilder(state, expression, arrayId, lengthId, 0, shouldUpdateLengthId),
				);
			}
		}
	}
	return luau.list.make(luau.call(luau.globals.unpack, [arrayId]));
}
