import luau from "@roblox-ts/luau-ast";

function getLiteralNumberValue(expression: luau.Expression): number | undefined {
	if (luau.isNumberLiteral(expression)) {
		return Number(expression.value);
	} else if (luau.isUnaryExpression(expression) && expression.operator === "-") {
		const innerValue = getLiteralNumberValue(expression.expression);
		if (innerValue !== undefined) {
			return -innerValue;
		}
	}
	return undefined;
}

export function offset(expression: luau.Expression, value: number) {
	if (value === 0) {
		return expression;
	}
	// special case to handle adding and removing the offset
	if (expression.kind === luau.SyntaxKind.BinaryExpression) {
		if (expression.right.kind === luau.SyntaxKind.NumberLiteral) {
			if (Number(expression.right.value) === value) {
				return expression.left;
			}
		}
	}
	const literalValue = getLiteralNumberValue(expression);
	if (literalValue !== undefined) {
		return luau.number(literalValue + value);
	} else {
		return luau.binary(expression, value > 0 ? "+" : "-", luau.number(Math.abs(value)));
	}
}
