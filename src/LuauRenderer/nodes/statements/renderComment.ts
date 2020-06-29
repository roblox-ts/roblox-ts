import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderComment(state: RenderState, node: luau.Comment) {
	return node.text
		.split("\n")
		.map(value => state.line(`--${value}`))
		.join("");
}
