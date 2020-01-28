import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";

export function renderAssignment(state: RenderState, node: lua.Assignment) {
	const leftStr = render(state, node.left);
	const rightStr = render(state, node.right);
	return state.indent + `${leftStr} = ${rightStr}\n`;
}
