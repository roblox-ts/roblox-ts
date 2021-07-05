import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderRepeatStatement(state: RenderState, node: luau.RepeatStatement) {
	let result = "";
	result += state.line(`repeat`);
	result += state.block(() => renderStatements(state, node.statements));
	result += state.line(`until ${render(state, node.condition)}`);
	return result;
}
