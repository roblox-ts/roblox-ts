import * as lua from "LuaAST";

export function convertToIndexableExpression(expression: lua.Expression) {
	if (lua.isIndexableExpression(expression)) {
		return expression;
	}
	return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
}
