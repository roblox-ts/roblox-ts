import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { offset } from "TSTransformer/util/offset";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";

export function addOneIfArrayType(
	state: TransformState,
	type: ts.Type | ReadonlyArray<ts.Type>,
	expression: luau.Expression,
) {
	if (ts.isArray(type) || isDefinitelyType(type, t => isArrayType(state, t))) {
		return offset(expression, 1);
	} else {
		return expression;
	}
}
