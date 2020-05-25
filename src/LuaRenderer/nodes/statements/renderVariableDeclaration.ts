import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderVariableDeclaration(state: RenderState, node: lua.VariableDeclaration) {
	const leftStr = lua.list.isList(node.left)
		? lua.list.mapToArray(node.left, id => render(state, id)).join(", ")
		: render(state, node.left);
	if (node.right) {
		const rightStr = render(state, node.right);
		return state.line(`local ${leftStr} = ${rightStr}`, node);
	} else {
		return state.line(`local ${leftStr}`, node);
	}
}
