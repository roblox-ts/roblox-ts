import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderForStatement(state: RenderState, node: lua.ForStatement) {
	let result = "";

	const idsStr = lua.list.mapToArray(node.ids, id => render(state, id)).join(", ");
	const expStr = render(state, node.expression);

	result += state.indent + `for ${idsStr} in ${expStr} do\n`;
	state.pushIndent();
	result += renderStatements(state, node.statements);
	state.popIndent();
	result += state.indent + `end\n`;

	return result;
}
