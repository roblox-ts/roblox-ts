import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function expressionMightMutate(
	state: TransformState,
	expression: luau.Expression,
	node?: ts.Expression,
): boolean {
	if (luau.isTemporaryIdentifier(expression)) {
		// Assume tempIds are never re-assigned after being returned
		// TODO: Is this actually safe to assume?
		return false;
	} else if (luau.isParenthesizedExpression(expression)) {
		return expressionMightMutate(state, expression.expression);
	} else if (luau.isSimplePrimitive(expression)) {
		return false;
	} else if (luau.isFunctionExpression(expression)) {
		return false;
	} else if (luau.isVarArgsLiteral(expression)) {
		return false;
	} else if (luau.isIfExpression(expression)) {
		return (
			expressionMightMutate(state, expression.condition) ||
			expressionMightMutate(state, expression.expression) ||
			expressionMightMutate(state, expression.alternative)
		);
	} else if (luau.isBinaryExpression(expression)) {
		return expressionMightMutate(state, expression.left) || expressionMightMutate(state, expression.right);
	} else if (luau.isUnaryExpression(expression)) {
		return expressionMightMutate(state, expression.expression);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		return luau.list.some(expression.members, member => expressionMightMutate(state, member));
	} else if (luau.isMap(expression)) {
		return luau.list.some(
			expression.fields,
			field => expressionMightMutate(state, field.index) || expressionMightMutate(state, field.value),
		);
	} else {
		if (node) {
			node = skipDownwards(node);
			if (ts.isIdentifier(node)) {
				const symbol = state.typeChecker.getSymbolAtLocation(node);
				if (symbol && !isSymbolMutable(state, symbol)) {
					return false;
				}
			}
		}
		// Identifier
		// ComputedIndexExpression
		// PropertyAccessExpression
		// CallExpression
		// MethodCallExpression
		return true;
	}
}
