import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderMixedTable(state: RenderState, node: luau.MixedTable) {
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
