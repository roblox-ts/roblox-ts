import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderMixedTable(state: RenderState, node: luau.MixedTable) {
	if (luau.list.isEmpty(node.fields)) {
		return "{}";
	}

	let result = "{\n";
	state.block(() => {
		// temp fix for https://github.com/microsoft/TypeScript/issues/42932
		luau.list.forEach(node.fields, field => (result += state.line(`${render(state, field as luau.Node)},`)));
	});
	result += state.indented("}");
	return result;
}
