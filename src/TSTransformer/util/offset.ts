import luau from "LuauAST";

export function offset(expression: luau.Expression, value: number) {
	if (value === 0) {
		return expression;
	}
	if (luau.isNumberLiteral(expression)) {
		return luau.create(luau.SyntaxKind.NumberLiteral, {
			value: expression.value + value,
		});
	} else {
		return luau.binary(expression, value > 0 ? "+" : "-", luau.number(Math.abs(value)));
	}
}
