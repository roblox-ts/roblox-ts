import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderArray(state: RenderState, node: luau.Array) {
	if (luau.list.isEmpty(node.members)) {
		return "{}";
	}

	const membersStr = luau.list.mapToArray(node.members, member => render(state, member)).join(", ");
	return `{ ${membersStr} }`;
}
