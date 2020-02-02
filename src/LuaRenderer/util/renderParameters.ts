import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

/**
 * Renders the given list of identifiers inside of `node` into a string sepearted by commas
 *
 * Adds `...` onto the end if node.hasVarArgs is true
 */
export function renderParameters(state: RenderState, node: lua.HasParameters) {
	const argsStrs = lua.list.mapToArray(node.args, arg => render(state, arg));
	if (node.hasVarArgs) {
		argsStrs.push("...");
	}
	return argsStrs.join(", ");
}
