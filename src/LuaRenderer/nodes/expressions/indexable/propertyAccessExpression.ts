import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";

export function renderPropertyAccessExpression(state: RenderState, node: lua.PropertyAccessExpression) {
	const expStr = render(state, node.expression);
	const nameStr = render(state, node.name);
	return `${expStr}.${nameStr}`;
}
