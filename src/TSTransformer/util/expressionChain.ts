import * as lua from "LuaAST";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

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
		return lua.binary(expressions[index], operator, binaryExpressionChain(expressions, operator, index + 1));
	}
}

export function propertyAccessExpressionChain(
	expression: lua.Expression,
	names: Array<string>,
	index = names.length - 1,
): lua.IndexableExpression {
	if (index < 0) {
		return convertToIndexableExpression(expression);
	} else {
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: propertyAccessExpressionChain(expression, names, index - 1),
			name: names[index],
		});
	}
}
