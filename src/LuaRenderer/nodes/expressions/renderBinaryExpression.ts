import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderBinaryExpression(state: RenderState, node: lua.BinaryExpression) {
	return `${render(state, node.left)} ${node.operator} ${render(state, node.right)}`;
}
