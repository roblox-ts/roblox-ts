import ts from "byots";
import luau from "LuauAST";
import { DiagnosticFactory, diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayLiteralExpression } from "TSTransformer/nodes/expressions/transformArrayLiteralExpression";
import { transformAsExpression } from "TSTransformer/nodes/expressions/transformAsExpression";
import { transformAwaitExpression } from "TSTransformer/nodes/expressions/transformAwaitExpression";
import { transformBinaryExpression } from "TSTransformer/nodes/expressions/transformBinaryExpression";
import { transformCallExpression } from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformClassExpression } from "TSTransformer/nodes/expressions/transformClassExpression";
import { transformConditionalExpression } from "TSTransformer/nodes/expressions/transformConditionalExpression";
import { transformElementAccessExpression } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformFunctionExpression } from "TSTransformer/nodes/expressions/transformFunctionExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformJsxElement } from "TSTransformer/nodes/expressions/transformJsxElement";
import { transformJsxSelfClosingElement } from "TSTransformer/nodes/expressions/transformJsxSelfClosingElement";
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
import { transformSpreadElement } from "TSTransformer/nodes/expressions/transformSpreadElement";
import { transformTaggedTemplateExpression } from "TSTransformer/nodes/expressions/transformTaggedTemplateExpression";
import { transformTemplateExpression } from "TSTransformer/nodes/expressions/transformTemplateExpression";
import { transformThisExpression } from "TSTransformer/nodes/expressions/transformThisExpression";
import {
	transformPostfixUnaryExpression,
	transformPrefixUnaryExpression,
} from "TSTransformer/nodes/expressions/transformUnaryExpression";
import { transformVoidExpression } from "TSTransformer/nodes/expressions/transformVoidExpression";
import { getKindName } from "TSTransformer/util/getKindName";

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Statement) => {
	state.addDiagnostic(factory(node));
	return luau.emptyId();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpressionTransformer = (state: TransformState, node: any) => luau.Expression;

const TRANSFORMER_BY_KIND = new Map<ts.SyntaxKind, ExpressionTransformer>([
	// banned expressions
	[ts.SyntaxKind.DeleteExpression, DIAGNOSTIC(diagnostics.noDeleteExpression)],
	[ts.SyntaxKind.NullKeyword, DIAGNOSTIC(diagnostics.noNullLiteral)],
	[ts.SyntaxKind.PrivateIdentifier, DIAGNOSTIC(diagnostics.noPrivateIdentifier)],
	[ts.SyntaxKind.TypeOfExpression, DIAGNOSTIC(diagnostics.noTypeOfExpression)],
	[ts.SyntaxKind.RegularExpressionLiteral, DIAGNOSTIC(diagnostics.noRegex)],

	// regular transforms
	[ts.SyntaxKind.ArrayLiteralExpression, transformArrayLiteralExpression],
	[ts.SyntaxKind.ArrowFunction, transformFunctionExpression],
	[ts.SyntaxKind.AsExpression, transformAsExpression],
	[ts.SyntaxKind.AwaitExpression, transformAwaitExpression],
	[ts.SyntaxKind.BinaryExpression, transformBinaryExpression],
	[ts.SyntaxKind.CallExpression, transformCallExpression],
	[ts.SyntaxKind.ClassExpression, transformClassExpression],
	[ts.SyntaxKind.ConditionalExpression, transformConditionalExpression],
	[ts.SyntaxKind.ElementAccessExpression, transformElementAccessExpression],
	[ts.SyntaxKind.FalseKeyword, transformFalseKeyword],
	[ts.SyntaxKind.FunctionExpression, transformFunctionExpression],
	[ts.SyntaxKind.Identifier, transformIdentifier],
	[ts.SyntaxKind.JsxElement, transformJsxElement],
	[ts.SyntaxKind.JsxSelfClosingElement, transformJsxSelfClosingElement],
	[ts.SyntaxKind.NewExpression, transformNewExpression],
	[ts.SyntaxKind.NonNullExpression, transformNonNullExpression],
	[ts.SyntaxKind.NoSubstitutionTemplateLiteral, transformStringLiteral],
	[ts.SyntaxKind.NumericLiteral, transformNumericLiteral],
	[ts.SyntaxKind.ObjectLiteralExpression, transformObjectLiteralExpression],
	[ts.SyntaxKind.ParenthesizedExpression, transformParenthesizedExpression],
	[ts.SyntaxKind.PostfixUnaryExpression, transformPostfixUnaryExpression],
	[ts.SyntaxKind.PrefixUnaryExpression, transformPrefixUnaryExpression],
	[ts.SyntaxKind.PropertyAccessExpression, transformPropertyAccessExpression],
	[ts.SyntaxKind.SpreadElement, transformSpreadElement],
	[ts.SyntaxKind.StringLiteral, transformStringLiteral],
	[ts.SyntaxKind.TaggedTemplateExpression, transformTaggedTemplateExpression],
	[ts.SyntaxKind.TemplateExpression, transformTemplateExpression],
	[ts.SyntaxKind.ThisKeyword, transformThisExpression],
	[ts.SyntaxKind.TrueKeyword, transformTrueKeyword],
	[ts.SyntaxKind.VoidExpression, transformVoidExpression],
]);

export function transformExpression(state: TransformState, node: ts.Expression): luau.Expression {
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(state, node);
	}
	assert(false, `Unknown expression: ${getKindName(node.kind)}`);
}
