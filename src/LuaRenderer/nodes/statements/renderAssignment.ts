import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { getEnding } from "LuaRenderer/util/getEnding";

export function renderAssignment(state: RenderState, node: lua.Assignment) {
	const leftStr = render(state, node.left);
	const rightStr = render(state, node.right);
	return state.indent + `${leftStr} = ${rightStr}${getEnding(state, node)}\n`;
}
