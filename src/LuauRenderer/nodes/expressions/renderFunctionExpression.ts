import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { renderParameters } from "LuauRenderer/util/renderParameters";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderFunctionExpression(state: RenderState, node: luau.FunctionExpression) {
	if (luau.list.isEmpty(node.statements)) {
		return `function(${renderParameters(state, node)}) end`;
	}

	let result = "";
	result += state.newline(`function(${renderParameters(state, node)})`);
	result += state.block(() => renderStatements(state, node.statements));
	result += state.indented(`end`);
	return result;
}
