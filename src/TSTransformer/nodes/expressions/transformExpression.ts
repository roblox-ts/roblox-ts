import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformBinaryExpression } from "TSTransformer/nodes/expressions/transformBinaryExpression";
import { transformCallExpression } from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformNumericLiteral, transformStringLiteral } from "TSTransformer/nodes/expressions/transformLiteral";
import { transformParenthesizedExpression } from "TSTransformer/nodes/expressions/transformParenthesizedExpression";
import { transformPostfixUnaryExpression, transformPrefixUnaryExpression } from "TSTransformer/nodes/expressions/transformUnaryExpression";
import { getKindName } from "TSTransformer/util/ast";
import ts from "typescript";

export function transformExpression(state: TransformState, node: ts.Expression): lua.Expression {
	if (ts.isIdentifier(node)) {
		return transformIdentifier(state, node);
	} else if (ts.isNumericLiteral(node)) {
		return transformNumericLiteral(state, node);
	} else if (ts.isStringLiteral(node)) {
		return transformStringLiteral(state, node);
	} else if (ts.isCallExpression(node)) {
		return transformCallExpression(state, node);
	} else if (ts.isPostfixUnaryExpression(node)) {
		return transformPostfixUnaryExpression(state, node);
	} else if (ts.isPrefixUnaryExpression(node)) {
		return transformPrefixUnaryExpression(state, node);
	} else if (ts.isParenthesizedExpression(node)) {
		return transformParenthesizedExpression(state, node);
	} else if (ts.isBinaryExpression(node)) {
		return transformBinaryExpression(state, node);
	}
	throw new Error(`Unknown expression: ${getKindName(node)}`);
}
