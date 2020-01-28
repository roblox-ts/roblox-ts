import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer/RenderState";

export function renderFalseLiteral(state: RenderState, node: lua.FalseLiteral) {
	return "false";
}

export function renderTrueLiteral(state: RenderState, node: lua.TrueLiteral) {
	return "true";
}

export function renderNilLiteral(state: RenderState, node: lua.NilLiteral) {
	return "nil";
}

export function renderVarArgsLiteral(state: RenderState, node: lua.VarArgsLiteral) {
	return "...";
}

export function renderNumberLiteral(state: RenderState, node: lua.NumberLiteral) {
	return `${node.value}`;
}

export function renderStringLiteral(render: RenderState, node: lua.StringLiteral) {
	// TODO: resolve " vs ' vs [[]]
	return `"${node.value}"`;
}
