import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderWhileStatement(state: RenderState, node: luau.WhileStatement) {
	let result = "";
	result += state.line(`while ${render(state, node.condition)} do`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);
	return result;
}
