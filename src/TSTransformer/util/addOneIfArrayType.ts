import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { offset } from "TSTransformer/util/offset";
import { isArrayType } from "TSTransformer/util/types";

export function addOneIfArrayType(
	state: TransformState,
	type: ts.Type | ReadonlyArray<ts.Type>,
	expression: luau.Expression,
) {
	if (ts.isArray(type) || isArrayType(state, type)) {
		return offset(expression, 1);
	} else {
		return expression;
	}
}
