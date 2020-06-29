import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderBinaryExpression(state: RenderState, node: luau.BinaryExpression) {
	return `${render(state, node.left)} ${node.operator} ${render(state, node.right)}`;
}
