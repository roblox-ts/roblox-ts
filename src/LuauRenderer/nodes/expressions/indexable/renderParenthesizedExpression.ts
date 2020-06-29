import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderParenthesizedExpression(state: RenderState, node: luau.ParenthesizedExpression) {
	// skip nested parentheses
	let expression = node.expression;
	while (luau.isParenthesizedExpression(expression)) {
		expression = expression.expression;
	}
	return `(${render(state, node.expression)})`;
}
