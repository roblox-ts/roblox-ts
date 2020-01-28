import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderComment(state: RenderState, node: lua.Comment) {
	return state.indent + `-- ${node.text}\n`;
}
