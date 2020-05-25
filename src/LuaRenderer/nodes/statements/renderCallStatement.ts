import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderCallStatement(state: RenderState, node: lua.CallStatement) {
	return state.line(`${render(state, node.expression)}`, node);
}
