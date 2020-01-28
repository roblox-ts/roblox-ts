import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";

export function renderUnaryExpression(state: RenderState, node: lua.UnaryExpression) {
	const expStr = render(state, node);
	if (node.operator === lua.UnaryOperator.Minus) {
		return `-${expStr}`;
	} else if (node.operator === lua.UnaryOperator.Not) {
		return `not ${expStr}`;
	} else if (node.operator === lua.UnaryOperator.Octothorpe) {
		return `#${expStr}`;
	} else {
		throw `Unexpected operator! ${lua.BinaryOperator[node.operator]} `;
	}
}
