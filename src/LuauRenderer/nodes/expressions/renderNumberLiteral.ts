import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderNumberLiteral(state: RenderState, node: luau.NumberLiteral) {
	return luau.isValidNumberLiteral(node.value) ? node.value : String(Number(node.value.replace(/_/g, "")));
}
