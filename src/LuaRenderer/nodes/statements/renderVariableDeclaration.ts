import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { getEnding } from "LuaRenderer/util/getEnding";

export function renderVariableDeclaration(state: RenderState, node: lua.VariableDeclaration) {
	const leftStr = render(state, node.left);
	const rightStr = render(state, node.right);
	return state.indent + `local ${leftStr} = ${rightStr}${getEnding(state, node)}\n`;
}
