import { render } from "../../..";
import * as lua from "../../../../LuaAST";
import { RenderState } from "../../../RenderState";
import { renderArguments } from "../../../util/arguments";

export function renderCallExpression(state: RenderState, node: lua.CallExpression) {
	const expStr = render(state, node.expression);
	const argsStr = renderArguments(state, node.params);
	return `${expStr}(${argsStr})`;
}
