import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";
import { renderParameters } from "LuaRenderer/util/renderParameters";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderFunctionExpression(state: RenderState, node: lua.FunctionExpression) {
	if (!node.statements.head) {
		return `function(${renderParameters(state, node)}) end`;
	}

	let result = "";
	result += state.newline(`function(${renderParameters(state, node)})`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.indented(`end`);
	return result;
}
