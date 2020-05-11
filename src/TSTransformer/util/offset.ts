import * as lua from "LuaAST";

export function offset(expression: lua.Expression, value: number) {
	if (value === 0) {
		return expression;
	}
	if (lua.isNumberLiteral(expression)) {
		return lua.create(lua.SyntaxKind.NumberLiteral, {
			value: expression.value + value,
		});
	} else {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: expression,
			operator: value > 0 ? "+" : "-",
			right: lua.number(Math.abs(value)),
		});
	}
}
