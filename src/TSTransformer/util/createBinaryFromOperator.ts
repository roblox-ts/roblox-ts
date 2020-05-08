import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import * as tsst from "ts-simple-type";
import { NodeWithType } from "TSTransformer/types/NodeWithType";

const OPERATOR_MAP = new Map<ts.SyntaxKind, lua.BinaryOperator>([
	// comparison
	[ts.SyntaxKind.LessThanToken, "<"],
	[ts.SyntaxKind.GreaterThanToken, ">"],
	[ts.SyntaxKind.LessThanEqualsToken, "<="],
	[ts.SyntaxKind.GreaterThanEqualsToken, ">="],
	[ts.SyntaxKind.EqualsEqualsEqualsToken, "=="],
	[ts.SyntaxKind.ExclamationEqualsEqualsToken, "~="],

	// math
	[ts.SyntaxKind.MinusToken, "-"],
	[ts.SyntaxKind.AsteriskToken, "*"],
	[ts.SyntaxKind.SlashToken, "/"],
	[ts.SyntaxKind.AsteriskAsteriskToken, "^"],
	[ts.SyntaxKind.PercentToken, "%"],

	// compound assignment
	[ts.SyntaxKind.MinusEqualsToken, "-"],
	[ts.SyntaxKind.AsteriskEqualsToken, "*"],
	[ts.SyntaxKind.SlashEqualsToken, "/"],
	[ts.SyntaxKind.AsteriskAsteriskEqualsToken, "^"],
	[ts.SyntaxKind.PercentEqualsToken, "%"],

	// unary
	[ts.SyntaxKind.PlusPlusToken, "+"],
	[ts.SyntaxKind.MinusMinusToken, "-"],
]);

const BITWISE_OPERATOR_MAP = new Map<ts.SyntaxKind, string>([
	// bitwise
	[ts.SyntaxKind.AmpersandToken, "band"],
	[ts.SyntaxKind.BarToken, "bor"],
	[ts.SyntaxKind.CaretToken, "bxor"],
	[ts.SyntaxKind.LessThanLessThanToken, "lshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, "rshift"],

	// bitwise compound assignment
	[ts.SyntaxKind.AmpersandEqualsToken, "band"],
	[ts.SyntaxKind.BarEqualsToken, "bor"],
	[ts.SyntaxKind.CaretEqualsToken, "bxor"],
	[ts.SyntaxKind.LessThanLessThanEqualsToken, "lshift"],
	[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, "rshift"],
]);

function isStringType(type: tsst.SimpleType) {
	return type.kind === tsst.SimpleTypeKind.STRING || type.kind === tsst.SimpleTypeKind.STRING_LITERAL;
}

function createToString(expression: lua.Expression) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.tostring,
		args: lua.list.make(expression),
	});
}

function createBinaryAdd(left: NodeWithType<lua.Expression>, right: NodeWithType<lua.Expression>) {
	const leftIsString = isStringType(left.type);
	const rightIsString = isStringType(right.type);
	if (leftIsString || rightIsString) {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: leftIsString ? left.node : createToString(left.node),
			operator: "..",
			right: rightIsString ? right.node : createToString(right.node),
		});
	} else {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: left.node,
			operator: "+",
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
				expression: lua.globals.bit32,
				name: bit32Name,
			}),
			args: lua.list.make(left.node, right.node),
		});
	}

	// TODO ts.SyntaxKind.GreaterThanGreaterThanToken -> TS.bit_lrsh
	// TODO ts.SyntaxKind.GreaterThanGreaterThanEqualsToken -> TS.bit_lrsh

	assert(false, `Unrecognized operatorToken: ${ts.SyntaxKind[operatorKind]}`);
}
