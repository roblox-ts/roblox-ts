import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";

export function renderSet(state: RenderState, node: lua.Set) {
	if (!node.members.head) {
		return "{}";
	}

	let result = "{\n";
	state.block(() => {
		lua.list.forEach(node.members, member => (result += state.indent + `[${render(state, member)}] = true,\n`));
	});
	result += state.indent + "}";
	return result;
}
