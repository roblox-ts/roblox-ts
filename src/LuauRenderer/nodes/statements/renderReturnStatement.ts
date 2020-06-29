import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderReturnStatement(state: RenderState, node: luau.ReturnStatement) {
	const expStr = luau.list.isList(node.expression)
		? luau.list.mapToArray(node.expression, exp => render(state, exp)).join(", ")
		: render(state, node.expression);
	return state.line(`return ${expStr}`);
}
