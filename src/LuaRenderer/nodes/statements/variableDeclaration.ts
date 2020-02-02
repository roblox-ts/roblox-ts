import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { needsSemicolon } from "LuaRenderer/util/needsSemicolon";

export function renderVariableDeclaration(state: RenderState, node: lua.VariableDeclaration) {
	const leftStr = render(state, node.left);
	const rightStr = render(state, node.right);
	return state.indent + `local ${leftStr} = ${rightStr}${needsSemicolon(state, node) ? ";" : ""}\n`;
}
