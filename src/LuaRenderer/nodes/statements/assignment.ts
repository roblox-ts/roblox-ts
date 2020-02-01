import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderAssignment(state: RenderState, node: lua.Assignment) {
	return state.indent + `${render(state, node.left)} = ${render(state, node.right)}\n`;
}
