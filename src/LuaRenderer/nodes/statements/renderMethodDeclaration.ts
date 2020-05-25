import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderParameters } from "LuaRenderer/util/renderParameters";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderMethodDeclaration(state: RenderState, node: lua.MethodDeclaration) {
	let result = "";
	result += state.line(`function ${render(state, node.expression)}:${node.name}(${renderParameters(state, node)})`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);
	return result;
}
