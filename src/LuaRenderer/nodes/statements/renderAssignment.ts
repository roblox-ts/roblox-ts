import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderAssignment(state: RenderState, node: lua.Assignment) {
	const leftStr = lua.list.isList(node.left)
		? lua.list.mapToArray(node.left, id => render(state, id)).join(", ")
		: render(state, node.left);
	const rightStr = render(state, node.right);
	return state.line(`${leftStr} ${node.operator} ${rightStr}`, node);
}
