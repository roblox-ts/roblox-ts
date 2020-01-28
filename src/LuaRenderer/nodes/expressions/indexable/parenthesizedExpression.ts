import { render } from "../../..";
import * as lua from "../../../../LuaAST";
import { RenderState } from "../../../RenderState";

export function renderParenthesizedExpression(state: RenderState, node: lua.ParenthesizedExpression) {
	return `(${render(state, node.expression)})`;
}
