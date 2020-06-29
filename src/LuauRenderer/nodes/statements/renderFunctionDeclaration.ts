import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { render, RenderState } from "LuauRenderer";
import { renderParameters } from "LuauRenderer/util/renderParameters";
import { renderStatements } from "LuauRenderer/util/renderStatements";

export function renderFunctionDeclaration(state: RenderState, node: luau.FunctionDeclaration) {
	if (node.localize) {
		assert(luau.isAnyIdentifier(node.name), "local function cannot be a property");
	}
	const nameStr = render(state, node.name);
	const paramStr = renderParameters(state, node);

	let result = "";
	result += state.line(`${node.localize ? "local " : ""}function ${nameStr}(${paramStr})`);
	result += state.scope(() => renderStatements(state, node.statements));
	result += state.line(`end`);
	return result;
}
