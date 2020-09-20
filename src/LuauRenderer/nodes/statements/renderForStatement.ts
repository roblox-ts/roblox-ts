import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderForStatement(state: RenderState, node: luau.ForStatement) {
	// for loop ids create their own scope
	// technically, this is the same scope as inside the for loop, but I think this is okay for our purposes
	state.pushScope();

	const idsStr = luau.list.mapToArray(node.ids, id => render(state, id)).join(", ") || "_";
	const expStr = render(state, node.expression);

	let result = "";
	result += state.line(`for ${idsStr} in ${expStr} do`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);

	state.popScope();
	return result;
}
