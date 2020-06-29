import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderParameters } from "LuauRenderer/util/renderParameters";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderMethodDeclaration(state: RenderState, node: luau.MethodDeclaration) {
	let result = "";
	result += state.line(`function ${render(state, node.expression)}:${node.name}(${renderParameters(state, node)})`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);
	return result;
}
