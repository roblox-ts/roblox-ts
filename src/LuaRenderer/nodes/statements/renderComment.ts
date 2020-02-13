import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderComment(state: RenderState, node: lua.Comment) {
	return node.text
		.split("\n")
		.map(value => state.indent + `--${value}\n`)
		.join("");
}
