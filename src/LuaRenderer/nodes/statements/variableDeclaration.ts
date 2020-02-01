import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderVariableDeclaration(state: RenderState, node: lua.VariableDeclaration) {
	return state.indent + `local ${render(state, node.id)} = ${render(state, node.value)}\n`;
}
