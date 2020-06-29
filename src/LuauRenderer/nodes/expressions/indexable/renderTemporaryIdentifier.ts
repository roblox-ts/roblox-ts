import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderTemporaryIdentifier(state: RenderState, node: luau.TemporaryIdentifier) {
	return state.getTempName(node);
}
