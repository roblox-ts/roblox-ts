import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderForStatement(state: RenderState, node: lua.ForStatement) {
	const idsStr = lua.list.mapToArray(node.ids, id => render(state, id)).join(", ");
	const expStr = render(state, node.expression);

	let result = "";
	result += state.indent + `for ${idsStr} in ${expStr} do\n`;
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;
	return result;
}
