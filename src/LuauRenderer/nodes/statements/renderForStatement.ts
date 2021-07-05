import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderForStatement(state: RenderState, node: luau.ForStatement) {
	const idsStr = luau.list.mapToArray(node.ids, id => render(state, id)).join(", ") || "_";
	const expStr = render(state, node.expression);

	let result = "";
	result += state.line(`for ${idsStr} in ${expStr} do`);
	result += state.block(() => renderStatements(state, node.statements));
	result += state.line(`end`);

	return result;
}
