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
	// this special case handles when the offset function is called next to a binary expression that has a number literal on its right
	// IE: array[offset - 1 + 1] -> array[offset]
	if (
		luau.isBinaryExpression(expression) &&
		luau.isNumberLiteral(expression.right) &&
		(expression.operator === "+" || expression.operator === "-")
	) {
		const rightValue = getLiteralNumberValue(expression.right) * (expression.operator === "-" ? -1 : 1);
		if (rightValue + value === 0) {
			return expression.left;
		} else {
			return luau.create(luau.SyntaxKind.BinaryExpression, {
				left: expression.left,
				operator: expression.operator,
				right: luau.create(luau.SyntaxKind.NumberLiteral, {
					value: (rightValue + value).toString(),
				}),
			});
		}
	}
	const literalValue = getLiteralNumberValue(expression);
	if (literalValue !== undefined) {
		return luau.number(literalValue + value);
	} else {
		return luau.binary(expression, value > 0 ? "+" : "-", luau.number(Math.abs(value)));
	}
}
