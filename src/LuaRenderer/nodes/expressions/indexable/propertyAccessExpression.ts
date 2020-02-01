import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { isValidLuaIdentifier } from "LuaRenderer/util/isValidLuaIdentifier";

export function renderPropertyAccessExpression(state: RenderState, node: lua.PropertyAccessExpression) {
	const expStr = render(state, node.expression);
	const nameStr = render(state, node.name);
	if (isValidLuaIdentifier(nameStr)) {
		return `${expStr}.${nameStr}`;
	} else {
		return `${expStr}["${nameStr}"]`;
	}
}
