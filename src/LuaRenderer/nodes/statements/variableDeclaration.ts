import { render } from "../..";
import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderVariableDeclaration(state: RenderState, node: lua.VariableDeclaration) {
	const idStr = render(state, node.id);
	const valueStr = render(state, node.value);
	return state.indent + `local ${idStr} = ${valueStr}\n`;
}
