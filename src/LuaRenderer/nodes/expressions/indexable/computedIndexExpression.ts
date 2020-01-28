import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";

export function renderComputedIndexExpression(state: RenderState, node: lua.ComputedIndexExpression) {
	const expStr = render(state, node.expression);
	const indexStr = render(state, node.index);
	return `${expStr}[${indexStr}]`;
}
