import luau from "LuauAST";

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

export function needsParentheses(node: luau.BinaryExpression | luau.UnaryExpression) {
	if (node.parent && luau.isBinaryExpression(node.parent)) {
		const precedence = luau.isBinaryExpression(node)
			? BINARY_OPERATOR_PRECEDENCE[node.operator]
			: UNARY_OPERATOR_PRECEDENCE[node.operator];
		return precedence < BINARY_OPERATOR_PRECEDENCE[node.parent.operator];
	}
	return false;
}
