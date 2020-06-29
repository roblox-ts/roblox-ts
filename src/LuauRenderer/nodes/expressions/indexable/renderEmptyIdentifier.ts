import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderEmptyIdentifier(state: RenderState, node: luau.EmptyIdentifier) {
	return "_";
}
