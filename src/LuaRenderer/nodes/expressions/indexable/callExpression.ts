import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderArguments } from "LuaRenderer/util/renderArguments";

export function renderCallExpression(state: RenderState, node: lua.CallExpression) {
	const expStr = render(state, node.expression);
	const argsStr = renderArguments(state, node.params);
	return `${expStr}(${argsStr})`;
}
