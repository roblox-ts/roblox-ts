import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderContinueStatement(state: RenderState, node: luau.ContinueStatement) {
	return state.line(`continue`);
}
