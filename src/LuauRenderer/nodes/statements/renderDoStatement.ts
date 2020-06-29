import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderDoStatement(state: RenderState, node: luau.DoStatement) {
	let result = "";
	result += state.line("do");
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line("end");
	return result;
}
