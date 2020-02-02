import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

/** Renders the given list of expressions into a string separated by commas */
export function renderArguments(state: RenderState, expressions: lua.List<lua.Expression>) {
	return lua.list.mapToArray(expressions, v => render(state, v)).join(", ");
}
