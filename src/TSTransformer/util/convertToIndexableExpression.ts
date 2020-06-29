import luau from "LuauAST";

export function convertToIndexableExpression(expression: luau.Expression) {
	if (luau.isIndexableExpression(expression)) {
		return expression;
	}
	return luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
}
