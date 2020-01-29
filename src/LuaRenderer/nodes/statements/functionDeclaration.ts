import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderParameters } from "LuaRenderer/util/parameters";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderFunctionDeclaration(state: RenderState, node: lua.FunctionDeclaration) {
	const hasLocal = lua.isIdentifier(node.name);
	const nameStr = render(state, node.name);
	const paramStr = renderParameters(state, node);

	let result = "";
	result += state.indent + `${hasLocal ? "local " : ""}function ${nameStr}(${paramStr})\n`;
	result += state.block(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;
	return result;
}
