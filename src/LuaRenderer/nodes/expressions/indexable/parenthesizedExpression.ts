import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderParenthesizedExpression(state: RenderState, node: lua.ParenthesizedExpression) {
	// skip nested parentheses
	let expression = node.expression;
	while (lua.isParenthesizedExpression(expression)) {
		expression = expression.expression;
	}
	if (lua.isParenthesizedExpression(node.expression) || lua.isIdentifier(node.expression)) {
		return render(state, node.expression);
	}
	return `(${render(state, node.expression)})`;
}
