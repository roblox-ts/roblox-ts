import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import ts from "typescript";
import { transformLogical } from "TSTransformer/util/transformLogical";

function getOperator(operatorKind: ts.BinaryOperator) {
	if (operatorKind === ts.SyntaxKind.PlusToken) {
		return lua.BinaryOperator.Plus;
	} else if (operatorKind === ts.SyntaxKind.MinusToken) {
		return lua.BinaryOperator.Minus;
	} else if (operatorKind === ts.SyntaxKind.AsteriskToken) {
		return lua.BinaryOperator.Asterisk;
	} else if (operatorKind === ts.SyntaxKind.SlashToken) {
		return lua.BinaryOperator.Slash;
	} else if (operatorKind === ts.SyntaxKind.AsteriskAsteriskToken) {
		return lua.BinaryOperator.Caret;
	} else if (operatorKind === ts.SyntaxKind.PercentToken) {
		return lua.BinaryOperator.Percent;
	} else if (operatorKind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
		return lua.BinaryOperator.EqualEqual;
	} else if (operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
		return lua.BinaryOperator.TildeEqual;
	}
	throw new Error(`Unrecognized operatorToken: ${ts.SyntaxKind[operatorKind]}`);
}

export function transformBinaryExpression(state: TransformState, node: ts.BinaryExpression) {
	const operatorKind = node.operatorToken.kind;

	if (
		operatorKind === ts.SyntaxKind.AmpersandAmpersandToken ||
		operatorKind === ts.SyntaxKind.BarBarToken ||
		operatorKind === ts.SyntaxKind.QuestionQuestionToken
	) {
		return transformLogical(state, node);
	}

	return lua.create(lua.SyntaxKind.BinaryExpression, {
		left: transformExpression(state, node.left),
		operator: getOperator(operatorKind),
		right: transformExpression(state, node.right),
	});
}
