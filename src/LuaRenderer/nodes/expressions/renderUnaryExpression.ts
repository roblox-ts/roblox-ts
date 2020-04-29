import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

const OPERATOR_TO_STRING: { [K in lua.UnaryOperator]: string } = {
	["not"]: "not ",
	["#"]: "#",
	["-"]: "-",
};

export function renderUnaryExpression(state: RenderState, node: lua.UnaryExpression) {
	const opStr = OPERATOR_TO_STRING[node.operator];
	const expStr = render(state, node.expression);
	if (lua.isBinaryExpression(node.expression)) {
		return `${opStr}(${expStr})`;
	}
	if (lua.isUnaryExpression(node.expression) && node.expression.operator === "-") {
		// -- will create a comment!
		return `${opStr} ${expStr}`;
	}
	return `${opStr}${expStr}`;
}
