import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderArguments } from "LuaRenderer/util/renderArguments";

export function renderCallExpression(state: RenderState, node: lua.CallExpression) {
	return `${render(state, node.expression)}(${renderArguments(state, node.args)})`;
}
