import * as lua from "LuaAST";

export function binaryExpressionChain(
	expressions: Array<lua.Expression>,
	operator: lua.BinaryOperator,
): lua.Expression {
	if (expressions.length === 1) {
		return expressions[0];
	} else {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: expressions[0],
			operator,
			right: binaryExpressionChain(expressions.slice(1), operator),
		});
	}
}
