import { render } from "../..";
import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderReturnStatement(state: RenderState, node: lua.ReturnStatement) {
	return `return ${render(state, node.expression)}`;
}
