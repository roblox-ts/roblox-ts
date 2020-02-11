import * as lua from "LuaAST";

export function binaryExpressionChain(
	expressions: Array<lua.Expression>,
	operator: lua.BinaryOperator,
	index = 0,
): lua.Expression {
	if (index === expressions.length - 1) {
		return expressions[index];
	} else {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: expressions[index],
			operator,
			right: binaryExpressionChain(expressions, operator, index + 1),
		});
	}
}
