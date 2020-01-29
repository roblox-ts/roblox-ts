import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderParameters } from "LuaRenderer/util/parameters";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderMethodDeclaration(state: RenderState, node: lua.MethodDeclaration) {
	let result = "";
	result +=
		state.indent +
		`function ${render(state, node.expression)}:${render(state, node.name)}(${renderParameters(state, node)})\n`;
	result += state.block(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;
	return result;
}
