import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { needsParentheses } from "LuauRenderer/util/needsParentheses";

function needsInnerParentheses(node: luau.UnaryExpression) {
	// #{} and -{} are invalid
	if ((node.operator === "#" || node.operator === "-") && luau.isTable(node.expression)) {
		return true;
	}

	return false;
}

function needsSpace(node: luau.UnaryExpression) {
	// not always needs a space
	if (node.operator === "not") {
		return true;
	}

	// "--" will create a comment!
	if (luau.isUnaryExpression(node.expression) && node.expression.operator === "-") {
		// previous expression was also "-"
		return true;
	}

	return false;
}

export function renderUnaryExpression(state: RenderState, node: luau.UnaryExpression) {
	let expStr = render(state, node.expression);
	let opStr = node.operator;

	if (needsSpace(node)) {
		opStr += " ";
	}

	if (needsInnerParentheses(node)) {
		expStr = `(${expStr})`;
	}

	let result = `${opStr}${expStr}`;

	if (needsParentheses(node)) {
		result = `(${result})`;
	}

	return result;
}
