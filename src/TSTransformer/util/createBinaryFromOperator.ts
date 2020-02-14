import * as lua from "LuaAST";
import ts from "typescript";

const OPERATOR_MAP = new Map<ts.SyntaxKind, lua.BinaryOperator>([
	// comparison
	[ts.SyntaxKind.LessThanToken, lua.BinaryOperator.LessThan],
	[ts.SyntaxKind.GreaterThanToken, lua.BinaryOperator.GreaterThan],
	[ts.SyntaxKind.LessThanEqualsToken, lua.BinaryOperator.LessThanEquals],
	[ts.SyntaxKind.GreaterThanEqualsToken, lua.BinaryOperator.GreaterThanEquals],
	[ts.SyntaxKind.EqualsEqualsEqualsToken, lua.BinaryOperator.EqualsEquals],
	[ts.SyntaxKind.ExclamationEqualsEqualsToken, lua.BinaryOperator.TildeEquals],

	// math
	[ts.SyntaxKind.MinusToken, lua.BinaryOperator.Minus],
	[ts.SyntaxKind.AsteriskToken, lua.BinaryOperator.Asterisk],
	[ts.SyntaxKind.SlashToken, lua.BinaryOperator.Slash],
	[ts.SyntaxKind.AsteriskAsteriskToken, lua.BinaryOperator.Caret],
	[ts.SyntaxKind.PercentToken, lua.BinaryOperator.Percent],

	// compound assignment
	[ts.SyntaxKind.MinusEqualsToken, lua.BinaryOperator.Minus],
	[ts.SyntaxKind.AsteriskEqualsToken, lua.BinaryOperator.Asterisk],
	[ts.SyntaxKind.SlashEqualsToken, lua.BinaryOperator.Slash],
	[ts.SyntaxKind.AsteriskAsteriskEqualsToken, lua.BinaryOperator.Caret],
	[ts.SyntaxKind.PercentEqualsToken, lua.BinaryOperator.Percent],

	// unary
	[ts.SyntaxKind.PlusPlusToken, lua.BinaryOperator.Plus],
	[ts.SyntaxKind.MinusMinusToken, lua.BinaryOperator.Minus],
]);

const BITWISE_OPERATOR_MAP = new Map<ts.SyntaxKind, string>([
	// bitwise
	[ts.SyntaxKind.AmpersandToken, "band"],
	[ts.SyntaxKind.BarToken, "bor"],
	[ts.SyntaxKind.CaretToken, "bxor"],
	[ts.SyntaxKind.LessThanLessThanToken, "lshift"],
	// TODO: ts.SyntaxKind.GreaterThanGreaterThanToken -> TS.bit_lrsh
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, "rshift"],

	// bitwise compound assignment
	[ts.SyntaxKind.AmpersandEqualsToken, "band"],
	[ts.SyntaxKind.BarEqualsToken, "bor"],
	[ts.SyntaxKind.CaretEqualsToken, "bxor"],
	[ts.SyntaxKind.LessThanLessThanEqualsToken, "lshift"],
	// TODO: ts.SyntaxKind.GreaterThanGreaterThanEqualsToken -> TS.bit_lrsh
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, "rshift"],
]);

// TODO: pass in ts-simple-type SimpleType here?
export function createBinaryFromOperator(
	left: lua.Expression,
	operatorKind: ts.SyntaxKind,
	right: lua.Expression,
): lua.Expression {
	// simple
	const operator = OPERATOR_MAP.get(operatorKind);
	if (operator !== undefined) {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: left,
			operator,
			right: right,
		});
	}

	// plus
	if (operatorKind === ts.SyntaxKind.PlusToken || operatorKind === ts.SyntaxKind.PlusEqualsToken) {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: left,
			operator: lua.BinaryOperator.Plus,
			right: right,
		});
	}

	// bitwise
	const bit32Name = BITWISE_OPERATOR_MAP.get(operatorKind);
	if (bit32Name !== undefined) {
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: lua.id("bit32"),
				name: bit32Name,
			}),
			args: lua.list.make(left, right),
		});
	}

	throw new Error(`Unrecognized operatorToken: ${ts.SyntaxKind[operatorKind]}`);
}
