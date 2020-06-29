import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderAssignment(state: RenderState, node: luau.Assignment) {
	const leftStr = luau.list.isList(node.left)
		? luau.list.mapToArray(node.left, id => render(state, id)).join(", ")
		: render(state, node.left);
	const rightStr = render(state, node.right);
	return state.line(`${leftStr} ${node.operator} ${rightStr}`, node);
}
