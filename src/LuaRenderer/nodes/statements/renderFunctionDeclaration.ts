import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { render, RenderState } from "LuaRenderer";
import { renderParameters } from "LuaRenderer/util/renderParameters";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderFunctionDeclaration(state: RenderState, node: lua.FunctionDeclaration) {
	const hasLocal = node.localize && assert(lua.isAnyIdentifier(node.name), "local function cannot be a property");
	const nameStr = render(state, node.name);
	const paramStr = renderParameters(state, node);

	let result = "";
	result += state.line(`${hasLocal ? "local " : ""}function ${nameStr}(${paramStr})`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);
	return result;
}
