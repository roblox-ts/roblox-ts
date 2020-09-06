import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { needsParentheses } from "LuauRenderer/util/needsParentheses";

export function renderBinaryExpression(state: RenderState, node: luau.BinaryExpression) {
	let result = `${render(state, node.left)} ${node.operator} ${render(state, node.right)}`;

	if (needsParentheses(node)) {
		result = `(${result})`;
	}

	return result;
}
