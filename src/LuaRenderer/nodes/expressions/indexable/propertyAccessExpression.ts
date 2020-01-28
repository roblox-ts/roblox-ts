import { render } from "../../..";
import * as lua from "../../../../LuaAST";
import { RenderState } from "../../../RenderState";

export function renderPropertyAccessExpression(state: RenderState, node: lua.PropertyAccessExpression) {
	const expStr = render(state, node.expression);
	return `${expStr}.${node.name}`;
}
