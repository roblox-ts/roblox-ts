import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticFactory, diagnostics } from "TSTransformer/diagnostics";
import { transformArrayLiteralExpression } from "TSTransformer/nodes/expressions/transformArrayLiteralExpression";
import { transformAsExpression } from "TSTransformer/nodes/expressions/transformAsExpression";
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
import { transformNewExpression } from "TSTransformer/nodes/expressions/transformNewExpression";
import { transformNonNullExpression } from "TSTransformer/nodes/expressions/transformNonNullExpression";
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
	state.addDiagnostic(factory(node));
	return lua.emptyId();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressionTransformer = (state: TransformState, node: any) => lua.Expression;

const TRANSFORMER_BY_KIND = new Map<ts.SyntaxKind, ExpressionTransformer>([
	// banned expressions
	[ts.SyntaxKind.NullKeyword, DIAGNOSTIC(diagnostics.noNullLiteral)],
	[ts.SyntaxKind.TypeOfExpression, DIAGNOSTIC(diagnostics.noTypeOfExpression)],

	// regular transforms
	[ts.SyntaxKind.ArrayLiteralExpression, transformArrayLiteralExpression],
	[ts.SyntaxKind.AsExpression, transformAsExpression],
	[ts.SyntaxKind.BinaryExpression, transformBinaryExpression],
	[ts.SyntaxKind.CallExpression, transformCallExpression],
	[ts.SyntaxKind.ConditionalExpression, transformConditionalExpression],
	[ts.SyntaxKind.ElementAccessExpression, transformElementAccessExpression],
	[ts.SyntaxKind.FalseKeyword, transformFalseKeyword],
	[ts.SyntaxKind.Identifier, transformIdentifier],
	[ts.SyntaxKind.NewExpression, transformNewExpression],
	[ts.SyntaxKind.NonNullExpression, transformNonNullExpression],
	[ts.SyntaxKind.NumericLiteral, transformNumericLiteral],
	[ts.SyntaxKind.ObjectLiteralExpression, transformObjectLiteralExpression],
	[ts.SyntaxKind.ParenthesizedExpression, transformParenthesizedExpression],
	[ts.SyntaxKind.PostfixUnaryExpression, transformPostfixUnaryExpression],
	[ts.SyntaxKind.PrefixUnaryExpression, transformPrefixUnaryExpression],
	[ts.SyntaxKind.PropertyAccessExpression, transformPropertyAccessExpression],
	[ts.SyntaxKind.StringLiteral, transformStringLiteral],
	[ts.SyntaxKind.TrueKeyword, transformTrueKeyword],
]);

export function transformExpression(state: TransformState, node: ts.Expression): lua.Expression {
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(state, node);
	}
	assert(false, `Unknown expression: ${getKindName(node)}`);
}
