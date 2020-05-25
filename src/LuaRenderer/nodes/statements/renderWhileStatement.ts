import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderWhileStatement(state: RenderState, node: lua.WhileStatement) {
	let result = "";
	result += state.line(`while ${render(state, node.condition)} do`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);
	return result;
}
