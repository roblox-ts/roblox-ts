import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { isValidLuaIdentifier } from "LuaRenderer/util/isValidLuaIdentifier";

export function renderComputedIndexExpression(state: RenderState, node: lua.ComputedIndexExpression) {
	const expStr = render(state, node.expression);
	if (lua.isStringLiteral(node.index) && isValidLuaIdentifier(node.index.value)) {
		return `${expStr}.${node.index.value}`;
	} else {
		const indexStr = render(state, node.index);
		return `${expStr}[${indexStr}]`;
	}
}
