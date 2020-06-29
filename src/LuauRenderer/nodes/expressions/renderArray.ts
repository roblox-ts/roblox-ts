import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderArray(state: RenderState, node: luau.Array) {
	if (!node.members.head) {
		return "{}";
	}

	const membersStr = luau.list.mapToArray(node.members, member => render(state, member)).join(", ");
	return `{ ${membersStr} }`;
}
