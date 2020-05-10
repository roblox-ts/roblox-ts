import ts from "byots";
import { TransformState } from "TSTransformer/TransformState";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformObjectKey(
	state: TransformState,
	name: ts.Identifier | ts.StringLiteral | ts.NumericLiteral | ts.ComputedPropertyName,
) {
	if (ts.isIdentifier(name)) {
		return lua.string(name.text);
	} else {
		// order here is fragile, ComputedPropertyName -> Identifier should NOT be string key
		// we must do this check here instead of before
		return transformExpression(state, ts.isComputedPropertyName(name) ? name.expression : name);
	}
}
