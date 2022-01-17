import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export function getConstantValueLiteral(
	state: TransformState,
	node: ts.EnumMember | ts.PropertyAccessExpression | ts.ElementAccessExpression,
) {
	const constantValue = state.typeChecker.getConstantValue(node);
	if (constantValue !== undefined) {
		if (typeof constantValue === "string") {
			return luau.string(constantValue);
		} else {
			return luau.number(constantValue);
		}
	}
}
