import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

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

	return result;
}
