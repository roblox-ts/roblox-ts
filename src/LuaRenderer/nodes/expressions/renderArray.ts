import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderArray(state: RenderState, node: lua.Array) {
	if (!node.members.head) {
		return "{}";
	}

	const membersStr = lua.list.mapToArray(node.members, member => render(state, member)).join(", ");
	return `{ ${membersStr} }`;
}
