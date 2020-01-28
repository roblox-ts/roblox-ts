import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderRepeatStatement(state: RenderState, node: lua.RepeatStatement) {
	let result = "";
	result += state.indent + `repeat\n`;
	result += state.block(() => renderStatements(state, node.statements));
	result += state.indent + `until ${render(state, node.condition)}\n`;
	return result;
}
