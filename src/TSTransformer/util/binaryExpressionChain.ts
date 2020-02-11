import * as lua from "LuaAST";

/**
 * Combines multiple lua.Expression objects into a chain of lua.BinaryExpressions
 *
 * i.e. using `and` as our operator, `[a, b, c]` -> `a and b and c`
 */
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
