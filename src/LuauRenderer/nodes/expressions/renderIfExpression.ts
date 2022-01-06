import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { needsParentheses } from "LuauRenderer/util/needsParentheses";

export function renderIfExpression(state: RenderState, node: luau.IfExpression) {
	let result = `if ${render(state, node.condition)} then ${render(state, node.expression)} `;

	let currentAlternative = node.alternative;
	while (luau.isIfExpression(currentAlternative)) {
		const condition = render(state, currentAlternative.condition);
		const expression = render(state, currentAlternative.expression);
		result += `elseif ${condition} then ${expression} `;
		currentAlternative = currentAlternative.alternative;
	}

	result += `else ${render(state, currentAlternative)}`;

	if (needsParentheses(node)) {
		result = `(${result})`;
	}

	return result;
}
