import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";

export function renderParenthesizedExpression(state: RenderState, node: lua.ParenthesizedExpression) {
	// skip nested parentheses
	let expression = node.expression;
	while (lua.isParenthesizedExpression(expression)) {
		expression = expression.expression;
	}
	return `(${render(state, node.expression)})`;
}
