import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderWhileStatement(state: RenderState, node: lua.WhileStatement) {
	let result = "";
	result += state.indent + `while ${render(state, node.condition)} do\n`;
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;
	return result;
}
