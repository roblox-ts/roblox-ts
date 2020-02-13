import * as lua from "LuaAST";
import ts from "typescript";

const OPERATOR_MAP = new Map<ts.SyntaxKind, lua.BinaryOperator>([
	[ts.SyntaxKind.PlusToken, lua.BinaryOperator.Plus],
	[ts.SyntaxKind.MinusToken, lua.BinaryOperator.Minus],
	[ts.SyntaxKind.AsteriskToken, lua.BinaryOperator.Asterisk],
	[ts.SyntaxKind.SlashToken, lua.BinaryOperator.Slash],
	[ts.SyntaxKind.AsteriskAsteriskToken, lua.BinaryOperator.Caret],
	[ts.SyntaxKind.PercentToken, lua.BinaryOperator.Percent],

	[ts.SyntaxKind.PlusEqualsToken, lua.BinaryOperator.Plus],
	[ts.SyntaxKind.MinusEqualsToken, lua.BinaryOperator.Minus],
	[ts.SyntaxKind.AsteriskEqualsToken, lua.BinaryOperator.Asterisk],
	[ts.SyntaxKind.SlashEqualsToken, lua.BinaryOperator.Slash],
	[ts.SyntaxKind.AsteriskAsteriskEqualsToken, lua.BinaryOperator.Caret],
	[ts.SyntaxKind.PercentEqualsToken, lua.BinaryOperator.Percent],

	[ts.SyntaxKind.PlusPlusToken, lua.BinaryOperator.Plus],
	[ts.SyntaxKind.MinusMinusToken, lua.BinaryOperator.Minus],
]);

export function createBinaryFromOperator(
	left: lua.Expression,
	tsOperator: ts.SyntaxKind,
	right: lua.Expression,
): lua.Expression {
	const operator = OPERATOR_MAP.get(tsOperator);
	if (operator !== undefined) {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left,
			operator,
			right,
		});
	}

	// test
	if (operator === ts.SyntaxKind.AmpersandToken) {
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: lua.id("bit32"),
				name: "band",
			}),
			args: lua.list.make(left, right),
		});
	}

	throw "???";
}
