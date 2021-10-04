import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export function getConstantValueLiteral(
	state: TransformState,
	node: ts.EnumMember | ts.PropertyAccessExpression | ts.ElementAccessExpression,
) {
	const constantValue = state.typeChecker.getConstantValue(node);
	if (constantValue !== undefined) {
		return typeof constantValue === "string" ? luau.string(constantValue) : luau.number(constantValue);
	}
}
