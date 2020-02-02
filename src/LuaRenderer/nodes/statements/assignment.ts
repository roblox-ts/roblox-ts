import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { needsSemicolon } from "LuaRenderer/util/needsSemicolon";

export function renderAssignment(state: RenderState, node: lua.Assignment) {
	const leftStr = render(state, node.left);
	const rightStr = render(state, node.right);
	return state.indent + `${leftStr} = ${rightStr}${needsSemicolon(state, node) ? ";" : ""}\n`;
}
