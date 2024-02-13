import luau from "@roblox-ts/luau-ast";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

/**
 * Combines multiple luau.Expression objects into a chain of luau.BinaryExpressions
 *
 * i.e. using `and` as our operator, `[a, b, c]` -> `a and b and c`
 */
export function binaryExpressionChain(
	expressions: Array<luau.Expression>,
	operator: luau.BinaryOperator,
): luau.Expression {
	return expressions.reduce((acc, current) => luau.binary(acc, operator, current));
}

/**
 * Combines multiple strings into a chain of property accesses
 *
 * i.e. `["a", "b", "c"]` -> `exp.a.b.c`
 */
export function propertyAccessExpressionChain(
	expression: luau.Expression,
	names: Array<string>,
): luau.IndexableExpression {
	return names.reduce((acc, current) => luau.property(acc, current), convertToIndexableExpression(expression));
}
