import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";
import { renderArguments } from "LuaRenderer/util/arguments";

export function renderMethodCallExpression(state: RenderState, node: lua.MethodCallExpression) {
	const expStr = render(state, node.expression);
	const nameStr = render(state, node.name);
	const argsStr = renderArguments(state, node.params);
	return `${expStr}:${nameStr}(${argsStr})`;
}
