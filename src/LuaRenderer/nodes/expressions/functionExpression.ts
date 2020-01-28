import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer/RenderState";
import { renderParameters } from "LuaRenderer/util/parameters";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderFunctionExpression(state: RenderState, node: lua.FunctionExpression) {
	let result = "";

	result += `function(${renderParameters(state, node)})\n`;
	state.pushIndent();
	result += renderStatements(state, node.statements);
	state.popIndent();
	result += state.indent + `end`;

	return result;
}
