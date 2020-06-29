import luau from "LuauAST";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

/**
 * Combines multiple luau.Expression objects into a chain of luau.BinaryExpressions
 *
 * i.e. using `and` as our operator, `[a, b, c]` -> `a and b and c`
 */
export function binaryExpressionChain(
	expressions: Array<luau.Expression>,
	operator: luau.BinaryOperator,
	index = 0,
): luau.Expression {
	if (index === expressions.length - 1) {
		return expressions[index];
	} else {
		return luau.binary(expressions[index], operator, binaryExpressionChain(expressions, operator, index + 1));
	}
}

export function propertyAccessExpressionChain(
	expression: luau.Expression,
	names: Array<string>,
	index = names.length - 1,
): luau.IndexableExpression {
	if (index < 0) {
		return convertToIndexableExpression(expression);
	} else {
		return luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression: propertyAccessExpressionChain(expression, names, index - 1),
			name: names[index],
		});
	}
}
