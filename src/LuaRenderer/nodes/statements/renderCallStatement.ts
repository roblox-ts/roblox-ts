import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { getEnding } from "LuaRenderer/util/getEnding";

export function renderCallStatement(state: RenderState, node: lua.CallStatement) {
	return state.indent + `${render(state, node.expression)}${getEnding(state, node)}\n`;
}
