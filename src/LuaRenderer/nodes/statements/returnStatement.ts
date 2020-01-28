import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";

export function renderReturnStatement(state: RenderState, node: lua.ReturnStatement) {
	return `return ${render(state, node.expression)}`;
}
