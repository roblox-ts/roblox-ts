import { render } from "../../..";
import * as lua from "../../../../LuaAST";
import { RenderState } from "../../../RenderState";
import { renderArguments } from "../../../util/arguments";

export function renderMethodCallExpression(state: RenderState, node: lua.MethodCallExpression) {
	const expStr = render(state, node.expression);
	const nameStr = render(state, node.name);
	const argsStr = renderArguments(state, node.params);
	return `${expStr}:${nameStr}(${argsStr})`;
}
