import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderTemporaryIdentifier(state: RenderState, node: lua.TemporaryIdentifier) {
	return state.getTempName(node);
}
