import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderForStatement(state: RenderState, node: lua.ForStatement) {
	// for loop ids create their own scope
	// technically, this is the same scope as inside the for loop, but I think this is okay for our purposes
	state.pushScope();

	const idsStr = lua.list.mapToArray(node.ids, id => render(state, id)).join(", ");
	const expStr = render(state, node.expression);

	let result = "";
	result += state.indent + `for ${idsStr} in ${expStr} do\n`;
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;

	state.popScope();
	return result;
}
