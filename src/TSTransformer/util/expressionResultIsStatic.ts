import luau from "@roblox-ts/luau-ast";
import { assertNever } from "Shared/util/assertNever";
import { TransformState } from "TSTransformer";

export function expressionResultIsStatic(state: TransformState, expression: luau.Expression): boolean {
	// metamethods only apply to things with metatable
	// metatable can only exist on something originating from identifiers, returns from functions, or properties
	// those are all marked as not static, so metamethods can be ignored in unary and binary expressions
	if (luau.isNone(expression)) {
		return true;
	} else if (luau.isSimplePrimitive(expression)) {
		return true;
	} else if (luau.isVarArgsLiteral(expression)) {
		return true;
	} else if (luau.isFunctionExpression(expression)) {
		return true;
	} else if (luau.isParenthesizedExpression(expression)) {
		return expressionResultIsStatic(state, expression.expression);
	} else if (luau.isUnaryExpression(expression)) {
		return expressionResultIsStatic(state, expression.expression);
	} else if (luau.isBinaryExpression(expression)) {
		return expressionResultIsStatic(state, expression.left) && expressionResultIsStatic(state, expression.right);
	} else if (luau.isIfExpression(expression)) {
		return (
			expressionResultIsStatic(state, expression.condition) &&
			expressionResultIsStatic(state, expression.expression) &&
			expressionResultIsStatic(state, expression.alternative)
		);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		return luau.list.every(expression.members, member => expressionResultIsStatic(state, member));
	} else if (luau.isMap(expression)) {
		return luau.list.every(
			expression.fields,
			field => expressionResultIsStatic(state, field.index) && expressionResultIsStatic(state, field.value),
		);
	} else if (luau.isMixedTable(expression)) {
		return luau.list.every(expression.fields, field => {
			if (luau.isMapField(field)) {
				return expressionResultIsStatic(state, field.index) && expressionResultIsStatic(state, field.value);
			} else {
				return expressionResultIsStatic(state, field);
			}
		});
	} else if (luau.isAnyIdentifier(expression)) {
		// luau.AnyIdentifier not static: variables might be changed by other code
		return false;
	} else if (luau.isCall(expression)) {
		// CallExpression and MethodCallExpression not static: might depend on other variables from outside the function
		return false;
	} else if (luau.isComputedIndexExpression(expression) || luau.isPropertyAccessExpression(expression)) {
		// ComputedIndexExpression and PropertyAccessExpression not static: table values might be changed by other code
		return false;
	} else {
		assertNever(expression, "Unhandled luau.Expression kind in expressionResultIsStatic");
	}
}
