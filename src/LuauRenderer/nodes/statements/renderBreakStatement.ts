import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderBreakStatement(state: RenderState, node: luau.BreakStatement) {
	return state.line(`break`);
}
