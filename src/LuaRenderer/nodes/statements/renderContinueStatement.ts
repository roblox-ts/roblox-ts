import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderContinueStatement(state: RenderState, node: lua.ContinueStatement) {
	return state.line(`continue`);
}
