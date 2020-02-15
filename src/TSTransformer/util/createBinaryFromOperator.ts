import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import ts from "typescript";
import { NodeWithType } from "TSTransformer/types/NodeWithType";

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

function isStringType(type: tsst.SimpleType) {
	return type.kind === tsst.SimpleTypeKind.STRING || type.kind === tsst.SimpleTypeKind.STRING_LITERAL;
}

function createToString(expression: lua.Expression) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.id("tostring"),
		args: lua.list.make(expression),
	});
}

function createBinaryAdd(left: NodeWithType<lua.Expression>, right: NodeWithType<lua.Expression>) {
	const leftIsString = isStringType(left.type);
	const rightIsString = isStringType(right.type);
	if (leftIsString || rightIsString) {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: leftIsString ? left.node : createToString(left.node),
			operator: lua.BinaryOperator.DotDot,
			right: rightIsString ? right.node : createToString(right.node),
		});
	} else {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: left.node,
			operator: lua.BinaryOperator.Plus,
			right: right.node,
		});
	}
}

export function createBinaryFromOperator(
	left: NodeWithType<lua.Expression>,
	operatorKind: ts.SyntaxKind,
	right: NodeWithType<lua.Expression>,
): lua.Expression {
	// simple
	const operator = OPERATOR_MAP.get(operatorKind);
	if (operator !== undefined) {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: left.node,
			operator,
			right: right.node,
		});
	}

	// plus
	if (operatorKind === ts.SyntaxKind.PlusToken || operatorKind === ts.SyntaxKind.PlusEqualsToken) {
		return createBinaryAdd(left, right);
	}

	// bitwise
	const bit32Name = BITWISE_OPERATOR_MAP.get(operatorKind);
	if (bit32Name !== undefined) {
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: lua.id("bit32"),
				name: bit32Name,
			}),
			args: lua.list.make(left.node, right.node),
		});
	}

	throw new Error(`Unrecognized operatorToken: ${ts.SyntaxKind[operatorKind]}`);
}
