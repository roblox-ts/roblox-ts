import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";

export function transformOmittedExpression(state: TransformState, node: ts.OmittedExpression) {
	return luau.nil();
}
