import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { offset } from "TSTransformer/util/offset";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import ts from "typescript";

export function addOneIfArrayType(
	state: TransformState,
	type: ts.Type,
	expression: luau.Expression,
	originNode: ts.Node,
) {
	// Use nonNullable to handle optional chaining
	type = ts.isArray(type)
		? type.map(t => state.typeChecker.getNonNullableType(t))
		: state.typeChecker.getNonNullableType(type);
	if (ts.isArray(type) || isDefinitelyType(state, type, originNode, isArrayType(state))) {
		return offset(expression, 1);
	} else {
		return expression;
	}
}
