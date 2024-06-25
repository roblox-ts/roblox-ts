import luau from "@roblox-ts/luau-ast";
import { DiagnosticFactory, errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayLiteralExpression } from "TSTransformer/nodes/expressions/transformArrayLiteralExpression";
import { transformAwaitExpression } from "TSTransformer/nodes/expressions/transformAwaitExpression";
import { transformBinaryExpression } from "TSTransformer/nodes/expressions/transformBinaryExpression";
import { transformFalseKeyword, transformTrueKeyword } from "TSTransformer/nodes/expressions/transformBooleanLiteral";
import { transformCallExpression } from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformClassExpression } from "TSTransformer/nodes/expressions/transformClassExpression";
import { transformConditionalExpression } from "TSTransformer/nodes/expressions/transformConditionalExpression";
import { transformDeleteExpression } from "TSTransformer/nodes/expressions/transformDeleteExpression";
import { transformElementAccessExpression } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformFunctionExpression } from "TSTransformer/nodes/expressions/transformFunctionExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformJsxElement } from "TSTransformer/nodes/expressions/transformJsxElement";
import { transformJsxExpression } from "TSTransformer/nodes/expressions/transformJsxExpression";
import { transformJsxFragment } from "TSTransformer/nodes/expressions/transformJsxFragment";
import { transformJsxSelfClosingElement } from "TSTransformer/nodes/expressions/transformJsxSelfClosingElement";
import { transformNewExpression } from "TSTransformer/nodes/expressions/transformNewExpression";
import { transformNoSubstitutionTemplateLiteral } from "TSTransformer/nodes/expressions/transformNoSubstitutionTemplateLiteral";
import { transformNumericLiteral } from "TSTransformer/nodes/expressions/transformNumericLiteral";
import { transformObjectLiteralExpression } from "TSTransformer/nodes/expressions/transformObjectLiteralExpression";
import { transformOmittedExpression } from "TSTransformer/nodes/expressions/transformOmittedExpression";
import { transformParenthesizedExpression } from "TSTransformer/nodes/expressions/transformParenthesizedExpression";
import { transformPropertyAccessExpression } from "TSTransformer/nodes/expressions/transformPropertyAccessExpression";
import { transformSpreadElement } from "TSTransformer/nodes/expressions/transformSpreadElement";
import { transformStringLiteral } from "TSTransformer/nodes/expressions/transformStringLiteral";
import { transformSuperKeyword } from "TSTransformer/nodes/expressions/transformSuperKeyword";
import { transformTaggedTemplateExpression } from "TSTransformer/nodes/expressions/transformTaggedTemplateExpression";
import { transformTemplateExpression } from "TSTransformer/nodes/expressions/transformTemplateExpression";
import { transformThisExpression } from "TSTransformer/nodes/expressions/transformThisExpression";
import { transformTypeExpression } from "TSTransformer/nodes/expressions/transformTypeExpression";
import {
	transformPostfixUnaryExpression,
	transformPrefixUnaryExpression,
} from "TSTransformer/nodes/expressions/transformUnaryExpression";
import { transformVoidExpression } from "TSTransformer/nodes/expressions/transformVoidExpression";
import { transformYieldExpression } from "TSTransformer/nodes/expressions/transformYieldExpression";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

const NO_EMIT = () => luau.none();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Expression) => {
	DiagnosticService.addDiagnostic(factory(node));
	return NO_EMIT();
};

export function transformExpression(state: TransformState, prereqs: Prereqs, node: ts.Expression): luau.Expression {
	// banned expressions
	if (ts.isBigIntLiteral(node)) return DIAGNOSTIC(errors.noBigInt)(state, node);
	if (node.kind === ts.SyntaxKind.NullKeyword) return DIAGNOSTIC(errors.noNullLiteral)(state, node);
	if (ts.isPrivateIdentifier(node)) return DIAGNOSTIC(errors.noPrivateIdentifier)(state, node);
	if (ts.isRegularExpressionLiteral(node)) return DIAGNOSTIC(errors.noRegex)(state, node);
	if (ts.isTypeOfExpression(node)) return DIAGNOSTIC(errors.noTypeOfExpression)(state, node);

	// skip transforms
	if (ts.isImportKeyword(node)) return NO_EMIT();

	// regular transforms
	if (ts.isArrayLiteralExpression(node)) return transformArrayLiteralExpression(state, prereqs, node);
	if (ts.isArrowFunction(node)) return transformFunctionExpression(state, node);
	if (ts.isAsExpression(node)) return transformTypeExpression(state, prereqs, node);
	if (ts.isAwaitExpression(node)) return transformAwaitExpression(state, prereqs, node);
	if (ts.isBinaryExpression(node)) return transformBinaryExpression(state, prereqs, node);
	if (ts.isCallExpression(node)) return transformCallExpression(state, prereqs, node);
	if (ts.isClassExpression(node)) return transformClassExpression(state, prereqs, node);
	if (ts.isConditionalExpression(node)) return transformConditionalExpression(state, prereqs, node);
	if (ts.isDeleteExpression(node)) return transformDeleteExpression(state, prereqs, node);
	if (ts.isElementAccessExpression(node)) return transformElementAccessExpression(state, prereqs, node);
	if (ts.isExpressionWithTypeArguments(node)) return transformTypeExpression(state, prereqs, node);
	if (node.kind === ts.SyntaxKind.FalseKeyword) return transformFalseKeyword();
	if (ts.isFunctionExpression(node)) return transformFunctionExpression(state, node);
	if (ts.isIdentifier(node)) return transformIdentifier(state, node);
	if (ts.isJsxElement(node)) return transformJsxElement(state, prereqs, node);
	if (ts.isJsxExpression(node)) return transformJsxExpression(state, prereqs, node);
	if (ts.isJsxFragment(node)) return transformJsxFragment(state, prereqs, node);
	if (ts.isJsxSelfClosingElement(node)) return transformJsxSelfClosingElement(state, prereqs, node);
	if (ts.isNewExpression(node)) return transformNewExpression(state, prereqs, node);
	if (ts.isNonNullExpression(node)) return transformTypeExpression(state, prereqs, node);
	if (ts.isNoSubstitutionTemplateLiteral(node)) return transformNoSubstitutionTemplateLiteral(node);
	if (ts.isNumericLiteral(node)) return transformNumericLiteral(node);
	if (ts.isObjectLiteralExpression(node)) return transformObjectLiteralExpression(state, prereqs, node);
	if (ts.isOmittedExpression(node)) return transformOmittedExpression();
	if (ts.isParenthesizedExpression(node)) return transformParenthesizedExpression(state, prereqs, node);
	if (ts.isPostfixUnaryExpression(node)) return transformPostfixUnaryExpression(state, prereqs, node);
	if (ts.isPrefixUnaryExpression(node)) return transformPrefixUnaryExpression(state, prereqs, node);
	if (ts.isPropertyAccessExpression(node)) return transformPropertyAccessExpression(state, prereqs, node);
	if (ts.isSatisfiesExpression(node)) return transformTypeExpression(state, prereqs, node);
	if (ts.isSpreadElement(node)) return transformSpreadElement(state, prereqs, node);
	if (ts.isStringLiteral(node)) return transformStringLiteral(node);
	if (ts.isSuperKeyword(node)) return transformSuperKeyword();
	if (ts.isTaggedTemplateExpression(node)) return transformTaggedTemplateExpression(state, prereqs, node);
	if (ts.isTemplateExpression(node)) return transformTemplateExpression(state, prereqs, node);
	if (node.kind === ts.SyntaxKind.ThisKeyword) return transformThisExpression(state, node as ts.ThisExpression);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return transformTrueKeyword();
	if (ts.isTypeAssertionExpression(node)) return transformTypeExpression(state, prereqs, node);
	if (ts.isVoidExpression(node)) return transformVoidExpression(state, prereqs, node);
	if (ts.isYieldExpression(node)) return transformYieldExpression(state, prereqs, node);

	assert(false, `Unknown expression: ${getKindName(node.kind)}`);
}
