import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderVariableDeclaration(state: RenderState, node: lua.VariableDeclaration) {
	const idStr = render(state, node.id);
	const valueStr = render(state, node.value);
	return state.indent + `local ${idStr} = ${valueStr}\n`;
}
