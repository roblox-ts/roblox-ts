import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderMap(state: RenderState, node: lua.Map) {
	if (!node.fields.head) {
		return "{}";
	}

	let result = "{\n";
	state.block(() => {
		lua.list.forEach(node.fields, field => (result += state.indent + `${render(state, field)},\n`));
	});
	result += state.indent + "}";
	return result;
}
