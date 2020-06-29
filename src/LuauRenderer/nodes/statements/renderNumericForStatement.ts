import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderNumericForStatement(state: RenderState, node: luau.NumericForStatement) {
	// for loop ids create their own scope
	// technically, this is the same scope as inside the for loop, but I think this is okay for our purposes
	state.pushScope();

	const idStr = render(state, node.id);
	const startStr = render(state, node.start);
	const endStr = render(state, node.end);

	let predicateStr = `${startStr}, ${endStr}`;
	if (node.step) {
		predicateStr += `, ${render(state, node.step)}`;
	}

	let result = "";
	result += state.line(`for ${idStr} = ${predicateStr} do`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);

	state.popScope();
	return result;
}
