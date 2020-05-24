import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderSet(state: RenderState, node: lua.Set) {
	if (!node.members.head) {
		return "{}";
	}

	let result = "{\n";
	state.block(() => {
		lua.list.forEach(node.members, member => (result += state.line(`[${render(state, member)}] = true,`)));
	});
	result += state.indented("}");
	return result;
}
