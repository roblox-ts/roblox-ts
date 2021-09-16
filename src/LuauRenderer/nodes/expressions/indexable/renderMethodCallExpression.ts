import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderArguments } from "LuauRenderer/util/renderArguments";
import { assert } from "Shared/util/assert";

export function renderMethodCallExpression(state: RenderState, node: luau.MethodCallExpression) {
	assert(luau.isValidIdentifier(node.name));
	return `${render(state, node.expression)}:${node.name}(${renderArguments(state, node.args)})`;
}
