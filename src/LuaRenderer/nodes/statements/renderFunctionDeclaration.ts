import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderParameters } from "LuaRenderer/util/renderParameters";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderFunctionDeclaration(state: RenderState, node: lua.FunctionDeclaration) {
	const hasLocal = lua.isAnyIdentifier(node.name);
	const nameStr = render(state, node.name);
	const paramStr = renderParameters(state, node);

	let result = "";
	result += state.indent + `${hasLocal ? "local " : ""}function ${nameStr}(${paramStr})\n`;
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;
	return result;
}
