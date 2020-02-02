import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { needsSemicolon } from "LuaRenderer/util/needsSemicolon";

export function renderCallStatement(state: RenderState, node: lua.CallStatement) {
	return state.indent + `${render(state, node.expression)}${needsSemicolon(state, node) ? ";" : ""}\n`;
}
