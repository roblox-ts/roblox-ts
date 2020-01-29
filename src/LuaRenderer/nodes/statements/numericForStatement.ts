import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderNumericForStatement(state: RenderState, node: lua.NumericForStatement) {
	const idStr = render(state, node.id);
	const minStr = render(state, node.min);
	const maxStr = render(state, node.max);

	let predicateStr: string;
	if (node.step) {
		const stepStr = render(state, node.step);
		predicateStr = `${minStr}, ${maxStr}, ${stepStr}`;
	} else {
		predicateStr = `${minStr}, ${maxStr}`;
	}

	let result = "";
	result += state.indent + `for ${idStr} = ${predicateStr} do\n`;
	result += state.block(() => renderStatements(state, node.statements));
	result += state.indent + `end\n`;
	return result;
}
