import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

function needsParentheses(expression: lua.Expression, operator: lua.UnaryOperator) {
	// #{} and -{} are invalid
	if ((operator === "#" || operator === "-") && lua.isTable(expression)) {
		return true;
	}

	// we should do -(a + b) instead of -a + b
	if (lua.isBinaryExpression(expression)) {
		return true;
	}

	return false;
}

function needsSpace(expression: lua.Expression, operator: lua.UnaryOperator) {
	// not always needs a space
	if (operator === "not") {
		return true;
	}

	// "--" will create a comment!
	if (lua.isUnaryExpression(expression) && expression.operator === "-") {
		return true;
	}

	return false;
}

export function renderUnaryExpression(state: RenderState, node: lua.UnaryExpression) {
	let expStr = render(state, node.expression);
	let opStr = node.operator;

	if (needsSpace(node.expression, node.operator)) {
		opStr += " ";
	}

	if (needsParentheses(node.expression, node.operator)) {
		expStr = `(${expStr})`;
	}

	return `${opStr}${expStr}`;
}
