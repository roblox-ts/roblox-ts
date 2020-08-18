import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";

export function transformSuperExpression(state: TransformState, node: ts.SuperExpression) {
	return luau.globals.super;
}
