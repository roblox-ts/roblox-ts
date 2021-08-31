import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { offset } from "TSTransformer/util/offset";
import { isArrayType, isDefinitelyType, isUndefinedType } from "TSTransformer/util/types";
import ts from "typescript";

export function addOneIfArrayType(
	state: TransformState,
	type: ts.Type | ReadonlyArray<ts.Type>,
	expression: luau.Expression,
) {
	if (ts.isArray(type) || isDefinitelyType(type, t => isArrayType(state, t) || isUndefinedType(t))) {
		return offset(expression, 1);
	} else {
		return expression;
	}
}
