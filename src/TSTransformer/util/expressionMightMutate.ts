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
	// Strip TS wrappers (parentheses, type assertions, non-null, satisfies)
	// up front so the TS node is available for structural matching below.
	if (node) {
		node = skipDownwards(node);
	}

	if (luau.isTemporaryIdentifier(expression)) {
		// Compiler-generated temps are never reassigned after declaration
		return false;
	} else if (luau.isParenthesizedExpression(expression)) {
		// Luau parens don't affect mutability; pass the (already unwrapped) TS node through
		return expressionMightMutate(state, expression.expression, node);
	} else if (luau.isSimplePrimitive(expression)) {
		return false;
	} else if (luau.isFunctionExpression(expression)) {
		return false;
	} else if (luau.isVarArgsLiteral(expression)) {
		return false;
	} else if (luau.isIfExpression(expression)) {
		const condNode = node && ts.isConditionalExpression(node) ? node : undefined;
		return (
			expressionMightMutate(state, expression.condition, condNode?.condition) ||
			expressionMightMutate(state, expression.expression, condNode?.whenTrue) ||
			expressionMightMutate(state, expression.alternative, condNode?.whenFalse)
		);
	} else if (luau.isBinaryExpression(expression)) {
		const binNode = node && ts.isBinaryExpression(node) ? node : undefined;
		return (
			expressionMightMutate(state, expression.left, binNode?.left) ||
			expressionMightMutate(state, expression.right, binNode?.right)
		);
	} else if (luau.isUnaryExpression(expression)) {
		const prefixNode = node && ts.isPrefixUnaryExpression(node) ? node : undefined;
		return expressionMightMutate(state, expression.expression, prefixNode?.operand);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		const arrNode = node && ts.isArrayLiteralExpression(node) ? node : undefined;
		let i = 0;
		return luau.list.some(expression.members, member =>
			expressionMightMutate(state, member, arrNode?.elements[i++]),
		);
	} else if (luau.isMap(expression)) {
		return luau.list.some(
			expression.fields,
			field => expressionMightMutate(state, field.index) || expressionMightMutate(state, field.value),
		);
	} else {
		if (node && ts.isIdentifier(node)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node);
			if (symbol && !isSymbolMutable(state, symbol)) {
				return false;
			}
		}
		// Identifier, ComputedIndexExpression, PropertyAccessExpression,
		// CallExpression, MethodCallExpression
		return true;
	}
}
