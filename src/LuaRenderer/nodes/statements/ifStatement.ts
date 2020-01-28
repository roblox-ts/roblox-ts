import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/statements";

export function renderIfStatement(state: RenderState, node: lua.IfStatement) {
	let result = "";

	result += state.indent + `if ${render(state, node.condition)} then\n`;
	if (node.statements) {
		state.pushIndent();
		result += renderStatements(state, node.statements);
		state.popIndent();
	}

	let currentElseBody = node.elseBody;
	while (lua.isNode(currentElseBody)) {
		result += `elseif ${render(state, currentElseBody.condition)} then\n`;
		state.pushIndent();
		result += renderStatements(state, currentElseBody.statements);
		state.popIndent();
		currentElseBody = currentElseBody.elseBody;
	}

	if (currentElseBody && currentElseBody.head) {
		result += state.indent + `else\n`;
		state.pushIndent();
		result += renderStatements(state, currentElseBody);
		state.popIndent();
	}

	result += state.indent + `end\n`;

	return result;
}
