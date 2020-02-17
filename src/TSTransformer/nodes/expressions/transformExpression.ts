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

const NO_EMIT = () => lua.emptyId();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Statement) => {
	state.diagnostics.push(factory(node));
	return NO_EMIT();
};

const EXPRESSION_TRANSFORMERS = {
	// banned expressions
	[ts.SyntaxKind.NullKeyword]: DIAGNOSTIC(diagnostics.noNullLiteral),
	[ts.SyntaxKind.TypeOfExpression]: DIAGNOSTIC(diagnostics.noTypeOfExpression),

	// regular transforms
	[ts.SyntaxKind.TrueKeyword]: transformTrueKeyword,
	[ts.SyntaxKind.FalseKeyword]: transformFalseKeyword,
	[ts.SyntaxKind.ArrayLiteralExpression]: transformArrayLiteralExpression,
	[ts.SyntaxKind.BinaryExpression]: transformBinaryExpression,
	[ts.SyntaxKind.CallExpression]: transformCallExpression,
	[ts.SyntaxKind.ConditionalExpression]: transformConditionalExpression,
	[ts.SyntaxKind.ElementAccessExpression]: transformElementAccessExpression,
	[ts.SyntaxKind.Identifier]: transformIdentifier,
	[ts.SyntaxKind.NumericLiteral]: transformNumericLiteral,
	[ts.SyntaxKind.ObjectLiteralExpression]: transformObjectLiteralExpression,
	[ts.SyntaxKind.ObjectLiteralExpression]: transformObjectLiteralExpression,
	[ts.SyntaxKind.ParenthesizedExpression]: transformParenthesizedExpression,
	[ts.SyntaxKind.PostfixUnaryExpression]: transformPostfixUnaryExpression,
	[ts.SyntaxKind.PrefixUnaryExpression]: transformPrefixUnaryExpression,
	[ts.SyntaxKind.PropertyAccessExpression]: transformPropertyAccessExpression,
	[ts.SyntaxKind.StringLiteral]: transformStringLiteral,
};

export function transformExpression(state: TransformState, node: ts.Expression): lua.Expression {
	const transformer = EXPRESSION_TRANSFORMERS[node.kind as keyof typeof EXPRESSION_TRANSFORMERS] as
		| ((state: TransformState, node: ts.Expression) => lua.Expression)
		| undefined;
	if (transformer) {
		return transformer(state, node);
	}

	throw new Error(`Unknown expression: ${getKindName(node)}`);
}
