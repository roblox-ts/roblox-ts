import luau from "LuauAST";

export function expressionMightMutate(expression: luau.Expression): boolean {
	if (luau.isEmptyIdentifier(expression) || luau.isTemporaryIdentifier(expression)) {
		return false;
	} else if (luau.isParenthesizedExpression(expression)) {
		return expressionMightMutate(expression.expression);
	} else if (luau.isSimplePrimitive(expression)) {
		return false;
	} else if (luau.isBinaryExpression(expression)) {
		return expressionMightMutate(expression.left) || expressionMightMutate(expression.right);
	} else if (luau.isUnaryExpression(expression)) {
		return expressionMightMutate(expression.expression);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		return luau.list.some(expression.members, member => expressionMightMutate(member));
	} else if (luau.isMap(expression)) {
		return luau.list.some(
			expression.fields,
			field => expressionMightMutate(field.index) || expressionMightMutate(field.value),
		);
	} else if (luau.isMixedTable(expression)) {
		return luau.list.some(expression.fields, field => {
			if (luau.isMapField(field)) {
				return expressionMightMutate(field.index) || expressionMightMutate(field.value);
			} else {
				return expressionMightMutate(field);
			}
		});
	} else {
		// Identifier
		// ComputedIndexExpression
		// PropertyAccessExpression
		// CallExpression
		// MethodCallExpression
		// VarArgsLiteral
		// FunctionExpression
		return true;
	}
}
