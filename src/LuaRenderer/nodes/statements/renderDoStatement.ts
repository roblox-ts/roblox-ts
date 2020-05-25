import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderDoStatement(state: RenderState, node: lua.DoStatement) {
	let result = "";
	result += state.line("do");
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line("end");
	return result;
}
