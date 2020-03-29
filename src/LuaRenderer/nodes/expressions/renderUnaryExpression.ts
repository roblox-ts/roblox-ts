import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderUnaryExpression(state: RenderState, node: lua.UnaryExpression) {
	return `${node.operator}${node.operator === "not" ? " " : ""}${render(state, node.expression)}`;
}
