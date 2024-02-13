import luau from "@roblox-ts/luau-ast";

function getLiteralNumberValue(expression: luau.NumberLiteral): number;
function getLiteralNumberValue(expression: luau.Expression): number | undefined;
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

	// this special case handles when the expression is a binary expression with a number literal on its right
	// i.e. array[offset - 1 + 1] -> array[offset]
	if (luau.isBinaryExpression(expression) && (expression.operator === "+" || expression.operator === "-")) {
		const rightValue = getLiteralNumberValue(expression.right);
		if (rightValue !== undefined) {
			const newRightValue = rightValue + value * (expression.operator === "-" ? -1 : 1);
			if (newRightValue === 0) {
				return expression.left;
			} else {
				return luau.binary(expression.left, expression.operator, luau.number(newRightValue));
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
