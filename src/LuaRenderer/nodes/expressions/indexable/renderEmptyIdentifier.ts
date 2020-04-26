import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderEmptyIdentifier(state: RenderState, node: lua.EmptyIdentifier) {
	return "_";
}
