import luau from "@roblox-ts/luau-ast";

export function getLiteralNumberValue(expression: luau.NumberLiteral): number;
export function getLiteralNumberValue(expression: luau.Expression): number | undefined;
export function getLiteralNumberValue(expression: luau.Expression): number | undefined {
	if (luau.isParenthesizedExpression(expression)) {
		return getLiteralNumberValue(expression.expression);
	} else if (luau.isNumberLiteral(expression)) {
		return Number(expression.value.replace(/_/g, ""));
	} else if (luau.isUnaryExpression(expression) && expression.operator === "-") {
		const innerValue = getLiteralNumberValue(expression.expression);
		if (innerValue !== undefined) {
			return -innerValue;
		}
	}
	return undefined;
}
