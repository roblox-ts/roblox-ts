import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { DiagnosticFactory, diagnostics } from "TSTransformer/diagnostics";
import { transformArrayLiteralExpression } from "TSTransformer/nodes/expressions/transformArrayLiteralExpression";
import { transformBinaryExpression } from "TSTransformer/nodes/expressions/transformBinaryExpression";
import { transformCallExpression } from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformConditionalExpression } from "TSTransformer/nodes/expressions/transformConditionalExpression";
import { transformElementAccessExpression } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import {
	transformFalseKeyword,
	transformNumericLiteral,
	transformStringLiteral,
	transformTrueKeyword,
} from "TSTransformer/nodes/expressions/transformLiteral";
import { transformObjectLiteralExpression } from "TSTransformer/nodes/expressions/transformObjectLiteralExpression";
import { transformParenthesizedExpression } from "TSTransformer/nodes/expressions/transformParenthesizedExpression";
import { transformPropertyAccessExpression } from "TSTransformer/nodes/expressions/transformPropertyAccessExpression";
import {
	transformPostfixUnaryExpression,
	transformPrefixUnaryExpression,
} from "TSTransformer/nodes/expressions/transformUnaryExpression";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Statement) => {
	state.diagnostics.push(factory(node));
	return lua.emptyId();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressionTransformer = (state: TransformState, node: any) => lua.Expression;

const TRANSFORMER_BY_KIND = new Map<ts.SyntaxKind, ExpressionTransformer>([
	// banned expressions
	[ts.SyntaxKind.NullKeyword, DIAGNOSTIC(diagnostics.noNullLiteral)],
	[ts.SyntaxKind.TypeOfExpression, DIAGNOSTIC(diagnostics.noTypeOfExpression)],

	// regular transforms
	[ts.SyntaxKind.TrueKeyword, transformTrueKeyword],
	[ts.SyntaxKind.FalseKeyword, transformFalseKeyword],
	[ts.SyntaxKind.ArrayLiteralExpression, transformArrayLiteralExpression],
	[ts.SyntaxKind.BinaryExpression, transformBinaryExpression],
	[ts.SyntaxKind.CallExpression, transformCallExpression],
	[ts.SyntaxKind.ConditionalExpression, transformConditionalExpression],
	[ts.SyntaxKind.ElementAccessExpression, transformElementAccessExpression],
	[ts.SyntaxKind.Identifier, transformIdentifier],
	[ts.SyntaxKind.NumericLiteral, transformNumericLiteral],
	[ts.SyntaxKind.ObjectLiteralExpression, transformObjectLiteralExpression],
	[ts.SyntaxKind.ObjectLiteralExpression, transformObjectLiteralExpression],
	[ts.SyntaxKind.ParenthesizedExpression, transformParenthesizedExpression],
	[ts.SyntaxKind.PostfixUnaryExpression, transformPostfixUnaryExpression],
	[ts.SyntaxKind.PrefixUnaryExpression, transformPrefixUnaryExpression],
	[ts.SyntaxKind.PropertyAccessExpression, transformPropertyAccessExpression],
	[ts.SyntaxKind.StringLiteral, transformStringLiteral],
]);

export function transformExpression(state: TransformState, node: ts.Expression): lua.Expression {
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(state, node);
	}

	throw new Error(`Unknown expression: ${getKindName(node)}`);
}
