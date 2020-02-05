import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformBinaryExpression } from "TSTransformer/nodes/expressions/transformBinaryExpression";
import { transformCallExpression } from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformConditionalExpression } from "TSTransformer/nodes/expressions/transformConditionalExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import {
	transformBooleanLiteral,
	transformNumericLiteral,
	transformStringLiteral,
} from "TSTransformer/nodes/expressions/transformLiteral";
import { transformObjectLiteralExpression } from "TSTransformer/nodes/expressions/transformObjectLiteralExpression";
import { transformParenthesizedExpression } from "TSTransformer/nodes/expressions/transformParenthesizedExpression";
import {
	transformPostfixUnaryExpression,
	transformPrefixUnaryExpression,
} from "TSTransformer/nodes/expressions/transformUnaryExpression";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

function isBooleanLiteral(node: ts.Node): node is ts.BooleanLiteral {
	return ts.isToken(node) && (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword);
}

export function transformExpression(state: TransformState, node: ts.Expression): lua.Expression {
	if (false) throw "";
	else if (ts.isIdentifier(node)) return transformIdentifier(state, node);
	else if (ts.isNumericLiteral(node)) return transformNumericLiteral(state, node);
	else if (ts.isStringLiteral(node)) return transformStringLiteral(state, node);
	else if (ts.isCallExpression(node)) return transformCallExpression(state, node);
	else if (ts.isPostfixUnaryExpression(node)) return transformPostfixUnaryExpression(state, node);
	else if (ts.isPrefixUnaryExpression(node)) return transformPrefixUnaryExpression(state, node);
	else if (ts.isParenthesizedExpression(node)) return transformParenthesizedExpression(state, node);
	else if (ts.isBinaryExpression(node)) return transformBinaryExpression(state, node);
	else if (ts.isObjectLiteralExpression(node)) return transformObjectLiteralExpression(state, node);
	else if (ts.isObjectLiteralExpression(node)) return transformObjectLiteralExpression(state, node);
	else if (ts.isConditionalExpression(node)) return transformConditionalExpression(state, node);
	else if (isBooleanLiteral(node)) return transformBooleanLiteral(state, node);

	throw new Error(`Unknown expression: ${getKindName(node)}`);
}
