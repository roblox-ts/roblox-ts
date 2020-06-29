import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderMap(state: RenderState, node: luau.Map) {
	if (!node.fields.head) {
		return "{}";
	}

	let result = "{\n";
	state.block(() => {
		luau.list.forEach(node.fields, field => (result += state.line(`${render(state, field)},`)));
	});
	result += state.indented("}");
	return result;
}
