import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderParameters(state: RenderState, node: lua.HasParameters) {
	const argsStrs = lua.list.mapToArray(node.args, arg => render(state, arg));
	if (node.hasVarArgs) {
		argsStrs.push("...");
	}
	return argsStrs.join(", ");
}
