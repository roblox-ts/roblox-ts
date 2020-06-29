import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderVariableDeclaration(state: RenderState, node: luau.VariableDeclaration) {
	const leftStr = luau.list.isList(node.left)
		? luau.list.mapToArray(node.left, id => render(state, id)).join(", ")
		: render(state, node.left);
	if (node.right) {
		const rightStr = render(state, node.right);
		return state.line(`local ${leftStr} = ${rightStr}`, node);
	} else {
		return state.line(`local ${leftStr}`, node);
	}
}
