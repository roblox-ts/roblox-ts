import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import ts from "typescript";

function getOperator(operatorToken: ts.BinaryOperatorToken) {
	if (operatorToken.kind === ts.SyntaxKind.PlusToken) {
		return lua.BinaryOperator.Plus;
	} else if (operatorToken.kind === ts.SyntaxKind.MinusToken) {
		return lua.BinaryOperator.Minus;
	} else if (operatorToken.kind === ts.SyntaxKind.AsteriskToken) {
		return lua.BinaryOperator.Asterisk;
	} else if (operatorToken.kind === ts.SyntaxKind.SlashToken) {
		return lua.BinaryOperator.Slash;
	} else if (operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken) {
		return lua.BinaryOperator.Caret;
	} else if (operatorToken.kind === ts.SyntaxKind.PercentToken) {
		return lua.BinaryOperator.Percent;
	}
	throw new Error(`Unrecognized operatorToken: ${ts.SyntaxKind[operatorToken.kind]}`);
}

export function transformBinaryExpression(state: TransformState, node: ts.BinaryExpression) {
	const operator = getOperator(node.operatorToken);
	const left = transformExpression(state, node.left);
	const right = transformExpression(state, node.right);
	return lua.create(lua.SyntaxKind.BinaryExpression, { left, operator, right });
}
