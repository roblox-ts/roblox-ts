import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";
import { renderParameters } from "LuaRenderer/util/parameters";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderFunctionDeclaration(state: RenderState, node: lua.FunctionDeclaration) {
	let result = "";
	result += state.indent + `local function ${render(state, node.name)}(${renderParameters(state, node)})\n`;
	state.pushIndent();
	result += renderStatements(state, node.statements);
	state.popIndent();
	result += state.indent + `end\n`;
	return result;
}
