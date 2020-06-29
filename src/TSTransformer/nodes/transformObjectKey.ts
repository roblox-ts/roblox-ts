import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformObjectKey(
	state: TransformState,
	name: ts.Identifier | ts.StringLiteral | ts.NumericLiteral | ts.ComputedPropertyName,
) {
	if (ts.isIdentifier(name)) {
		return luau.string(name.text);
	} else {
		// order here is fragile, ComputedPropertyName -> Identifier should NOT be string key
		// we must do this check here instead of before
		return transformExpression(state, ts.isComputedPropertyName(name) ? name.expression : name);
	}
}
