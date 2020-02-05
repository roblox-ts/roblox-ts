import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderArguments } from "LuaRenderer/util/renderArguments";

export function renderMethodCallExpression(state: RenderState, node: lua.MethodCallExpression) {
	return `${render(state, node.expression)}:${render(state, node.name)}(${renderArguments(state, node.args)})`;
}
