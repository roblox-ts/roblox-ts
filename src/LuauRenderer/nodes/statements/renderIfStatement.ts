import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderIfStatement(state: RenderState, node: luau.IfStatement) {
	let result = "";

	result += state.line(`if ${render(state, node.condition)} then`);
	if (node.statements) {
		result += state.scope(() => renderStatements(state, node.statements));
	}

	let currentElseBody = node.elseBody;
	while (luau.isNode(currentElseBody)) {
		const statements = currentElseBody.statements;
		result += state.line(`elseif ${render(state, currentElseBody.condition)} then`);
		result += state.scope(() => renderStatements(state, statements));
		currentElseBody = currentElseBody.elseBody;
	}

	if (currentElseBody && currentElseBody.head) {
		result += state.line(`else`);
		const statements = currentElseBody;
		result += state.scope(() => renderStatements(state, statements));
	}

	result += state.line(`end`);

	return result;
}
