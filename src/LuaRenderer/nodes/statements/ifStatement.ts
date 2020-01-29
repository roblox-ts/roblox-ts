import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderIfStatement(state: RenderState, node: lua.IfStatement) {
	let result = "";

	result += state.indent + `if ${render(state, node.condition)} then\n`;
	if (node.statements) {
		result += state.block(() => renderStatements(state, node.statements));
	}

	let currentElseBody = node.elseBody;
	while (lua.isNode(currentElseBody)) {
		const statements = currentElseBody.statements;
		result += state.indent + `elseif ${render(state, currentElseBody.condition)} then\n`;
		result += state.block(() => renderStatements(state, statements));
		currentElseBody = currentElseBody.elseBody;
	}

	if (currentElseBody && currentElseBody.head) {
		result += state.indent + `else\n`;
		const statements = currentElseBody;
		result += state.block(() => renderStatements(state, statements));
	}

	result += state.indent + `end\n`;

	return result;
}
