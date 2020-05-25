import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderRepeatStatement(state: RenderState, node: lua.RepeatStatement) {
	let result = "";
	result += state.line(`repeat`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`until ${render(state, node.condition)}`);
	return result;
}
