import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { offset } from "TSTransformer/util/offset";
import { isArrayType } from "TSTransformer/util/types";

export function addOneIfArrayType(state: TransformState, type: ts.Type, expression: lua.Expression) {
	if (isArrayType(state, type)) {
		return offset(expression, 1);
	} else {
		return expression;
	}
}
