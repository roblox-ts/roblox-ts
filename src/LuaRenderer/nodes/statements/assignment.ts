import { render } from "../..";
import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderAssignment(state: RenderState, node: lua.Assignment) {
	const leftStr = render(state, node.left);
	const rightStr = render(state, node.right);
	return state.indent + `${leftStr} = ${rightStr}\n`;
}
