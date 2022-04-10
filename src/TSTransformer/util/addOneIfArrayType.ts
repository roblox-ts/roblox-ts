import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { offset } from "TSTransformer/util/offset";
import { isArrayType, isDefinitelyType, isNumberType, isPossiblyType } from "TSTransformer/util/types";
import ts from "typescript";

export function addOneIfArrayType(
	state: TransformState,
	type: ts.Type,
	indexType: ts.Type,
	expression: luau.Expression,
	originNode: ts.Node,
) {
	// Use nonNullableType to handle optional chaining
	if (
		isPossiblyType(indexType, isNumberType) &&
		isDefinitelyType(state, state.typeChecker.getNonNullableType(type), originNode, isArrayType(state))
	) {
		return offset(expression, 1);
	} else {
		return expression;
	}
}
