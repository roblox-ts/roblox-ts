import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

function needsParentheses(expression: luau.Expression, operator: luau.UnaryOperator) {
	// #{} and -{} are invalid
	if ((operator === "#" || operator === "-") && luau.isTable(expression)) {
		return true;
	}

	// we should do -(a + b) instead of -a + b
	if (luau.isBinaryExpression(expression)) {
		return true;
	}

	return false;
}

function needsSpace(expression: luau.Expression, operator: luau.UnaryOperator) {
	// not always needs a space
	if (operator === "not") {
		return true;
	}

	// "--" will create a comment!
	if (luau.isUnaryExpression(expression) && expression.operator === "-") {
		// previous expression was also "-"
		return true;
	}

	return false;
}

export function renderUnaryExpression(state: RenderState, node: luau.UnaryExpression) {
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
