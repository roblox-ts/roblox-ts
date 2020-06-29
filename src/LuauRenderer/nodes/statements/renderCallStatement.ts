import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderCallStatement(state: RenderState, node: luau.CallStatement) {
	return state.line(`${render(state, node.expression)}`, node);
}
