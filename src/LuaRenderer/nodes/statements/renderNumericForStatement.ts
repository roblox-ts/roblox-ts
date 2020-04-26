import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/renderStatements";

export function renderNumericForStatement(state: RenderState, node: lua.NumericForStatement) {
	// for loop ids create their own scope
	// technically, this is the same scope as inside the for loop, but I think this is okay for our purposes
	state.pushScope();

	const idStr = render(state, node.id);
	const minStr = render(state, node.min);
	const maxStr = render(state, node.max);

	let predicateStr = `${minStr}, ${maxStr}`;
	if (node.step) {
		predicateStr += `, ${render(state, node.step)}`;
	}

	let result = "";
	result += state.indent + `for ${idStr} = ${predicateStr} do\n`;
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;

	state.popScope();
	return result;
}
