import luau from "LuauAST";
import { assert } from "Shared/util/assert";

// https://www.lua.org/manual/5.1/manual.html#2.5.6
/*
	1. or
	2. and
	3. <     >     <=    >=    ~=    ==
	4. ..
	5. +     -
	6. *     /     %
	7. not   #     - (unary)
	8. ^
*/

const IF_EXPRESSION_PRECEDENCE = 1;

const UNARY_OPERATOR_PRECEDENCE: { [K in luau.UnaryOperator]: number } = {
	not: 7,
	"#": 7,
	"-": 7,
};

const BINARY_OPERATOR_PRECEDENCE: { [K in luau.BinaryOperator]: number } = {
	or: 1,
	and: 2,
	"<": 3,
	">": 3,
	"<=": 3,
	">=": 3,
	"~=": 3,
	"==": 3,
	"..": 4,
	"+": 5,
	"-": 5,
	"*": 6,
	"/": 6,
	"%": 6,
	"^": 8,
};

// are these all the expression types that need to be considered..?
function getPrecedence(node: luau.ExpressionWithPrecedence) {
	if (luau.isIfExpression(node)) {
		return IF_EXPRESSION_PRECEDENCE;
	} else if (luau.isBinaryExpression(node)) {
		return BINARY_OPERATOR_PRECEDENCE[node.operator];
	} else if (luau.isUnaryExpression(node)) {
		return UNARY_OPERATOR_PRECEDENCE[node.operator];
	}
	assert(false);
}

export function needsParentheses(node: luau.ExpressionWithPrecedence) {
	if (node.parent && luau.isExpressionWithPrecedence(node.parent)) {
		const nodePrecedence = getPrecedence(node);
		const parentPrecedence = getPrecedence(node.parent);
		if (nodePrecedence < parentPrecedence) {
			return true;
		} else if (nodePrecedence === parentPrecedence) {
			return luau.isBinaryExpression(node.parent) && node === node.parent.right;
		}
	}
	return false;
}
