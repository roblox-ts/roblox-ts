import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderArguments } from "LuauRenderer/util/renderArguments";

export function renderCallExpression(state: RenderState, node: luau.CallExpression) {
	return `${render(state, node.expression)}(${renderArguments(state, node.args)})`;
}
