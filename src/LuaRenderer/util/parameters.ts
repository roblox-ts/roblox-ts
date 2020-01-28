import { render } from "..";
import * as lua from "../../LuaAST";
import { RenderState } from "../RenderState";

export function renderParameters(state: RenderState, node: lua.HasArguments) {
	const argsStrs = lua.list.mapToArray(node.args, arg => render(state, arg));
	if (node.hasVarArgs) {
		argsStrs.push("...");
	}
	return argsStrs.join(", ");
}
