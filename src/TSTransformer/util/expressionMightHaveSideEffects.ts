import luau from "@roblox-ts/luau-ast";
import { assertNever } from "Shared/util/assertNever";
import { TransformState } from "TSTransformer";

export function expressionMightHaveSideEffects(state: TransformState, expression: luau.Expression): boolean {
	if (luau.isNone(expression)) {
		return false;
	} else if (luau.isSimple(expression)) {
		return false;
	} else if (luau.isVarArgsLiteral(expression)) {
		return false;
	} else if (luau.isFunctionExpression(expression)) {
		return false;
	} else if (luau.isParenthesizedExpression(expression)) {
		return expressionMightHaveSideEffects(state, expression.expression);
	} else if (luau.isUnaryExpression(expression)) {
		// __unm and __len metamethods can have side effects
		// but no metamethod for `not expression`
		return expression.operator !== "not" || expressionMightHaveSideEffects(state, expression.expression);
	} else if (luau.isBinaryExpression(expression)) {
		return (
			// all operators have metamethods except the logical ones
			(expression.operator !== "and" && expression.operator !== "or") ||
			expressionMightHaveSideEffects(state, expression.left) ||
			expressionMightHaveSideEffects(state, expression.right)
		);
	} else if (luau.isIfExpression(expression)) {
		return (
			expressionMightHaveSideEffects(state, expression.condition) ||
			expressionMightHaveSideEffects(state, expression.expression) ||
			expressionMightHaveSideEffects(state, expression.alternative)
		);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		return luau.list.some(expression.members, member => expressionMightHaveSideEffects(state, member));
	} else if (luau.isMap(expression)) {
		return luau.list.some(
			expression.fields,
			field =>
				expressionMightHaveSideEffects(state, field.index) ||
				expressionMightHaveSideEffects(state, field.value),
		);
	} else if (luau.isMixedTable(expression)) {
		return luau.list.some(expression.fields, field => {
			if (luau.isMapField(field)) {
				return (
					expressionMightHaveSideEffects(state, field.index) ||
					expressionMightHaveSideEffects(state, field.value)
				);
			} else {
				return expressionMightHaveSideEffects(state, field);
			}
		});
	} else if (luau.isCall(expression)) {
		// CallExpression and MethodCallExpression because functions might mutate other things
		return true;
	} else if (luau.isComputedIndexExpression(expression) || luau.isPropertyAccessExpression(expression)) {
		// ComputedIndexExpression and PropertyAccessExpression with possible __index metamethod
		return true;
	} else {
		assertNever(expression, "Unhandled luau.Expression kind in expressionMightHaveSideEffects");
	}
}
