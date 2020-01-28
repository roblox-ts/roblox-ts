import { render } from "..";
import * as lua from "../../LuaAST";
import { RenderState } from "../RenderState";

export function renderArguments(state: RenderState, expressions: lua.List<lua.Expression>) {
	return lua.list.mapToArray(expressions, v => render(state, v)).join(", ");
}
