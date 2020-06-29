import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderArguments } from "LuauRenderer/util/renderArguments";

export function renderMethodCallExpression(state: RenderState, node: luau.MethodCallExpression) {
	return `${render(state, node.expression)}:${node.name}(${renderArguments(state, node.args)})`;
}
