import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";

export function renderMap(state: RenderState, node: lua.Map) {
	if (!node.fields.head) {
		return "{}";
	}

	let result = "{\n";
	state.pushIndent();
	lua.list.forEach(node.fields, field => (result += state.indent + `${render(state, field)},`));
	state.popIndent();
	result += "}";

	return result;
}
