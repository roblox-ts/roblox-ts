import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";

export function renderArguments(state: RenderState, expressions: lua.List<lua.Expression>) {
	return lua.list.mapToArray(expressions, v => render(state, v)).join(", ");
}
