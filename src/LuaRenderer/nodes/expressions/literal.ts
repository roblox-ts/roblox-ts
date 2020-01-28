import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderNumberLiteral(state: RenderState, node: lua.NumberLiteral) {
	return `${node.value}`;
}

export function renderStringLiteral(render: RenderState, node: lua.StringLiteral) {
	// TODO: resolve " vs ' vs [[]]
	return `"${node.value}"`;
}
