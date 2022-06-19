import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformPropertyName(state: TransformState, name: ts.PropertyName) {
	// identifier directly is from `{ a: value }`, so key must be "a"
	if (ts.isIdentifier(name)) {
		return luau.string(name.text);
	} else {
		// `name.expression`, if identifier, is from `{ [a]: value }`
		return transformExpression(state, ts.isComputedPropertyName(name) ? name.expression : name);
	}
}
