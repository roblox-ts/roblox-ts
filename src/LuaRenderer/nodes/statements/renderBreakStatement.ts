import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderBreakStatement(state: RenderState, node: lua.BreakStatement) {
	return state.indent + `break\n`;
}
