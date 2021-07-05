import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderNumericForStatement(state: RenderState, node: luau.NumericForStatement) {
	const idStr = render(state, node.id);
	const startStr = render(state, node.start);
	const endStr = render(state, node.end);

	let predicateStr = `${startStr}, ${endStr}`;
	if (node.step) {
		predicateStr += `, ${render(state, node.step)}`;
	}

	let result = "";
	result += state.line(`for ${idStr} = ${predicateStr} do`);
	result += state.block(() => renderStatements(state, node.statements));
	result += state.line(`end`);

	return result;
}
