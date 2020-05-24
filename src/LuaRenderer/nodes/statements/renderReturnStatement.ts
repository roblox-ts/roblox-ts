import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

export function renderReturnStatement(state: RenderState, node: lua.ReturnStatement) {
	const expStr = lua.list.isList(node.expression)
		? lua.list.mapToArray(node.expression, exp => render(state, exp)).join(", ")
		: render(state, node.expression);
	return state.line(`return ${expStr}`);
}
