import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
import {
	isDefinitelyType,
	isLuaTupleType,
	isPossiblyType,
	isStringType,
	isUndefinedType,
} from "TSTransformer/util/types";
import ts from "typescript";

export function transformTemplateExpression(state: TransformState, node: ts.TemplateExpression) {
	// if there are zero templateSpans, this must be a ts.NoSubstitutionTemplateLiteral
	// and will be handled in transformStringLiteral
	assert(node.templateSpans.length > 0);

	const expressions = new Array<luau.Expression>();

	if (node.head.text.length > 0) {
		expressions.push(createStringFromLiteral(node.head));
	}

	const orderedExpressions = ensureTransformOrder(
		state,
		node.templateSpans.map(templateSpan => templateSpan.expression),
	);

	for (let i = 0; i < node.templateSpans.length; i++) {
		const templateSpan = node.templateSpans[i];
		let expression = orderedExpressions[i];
		const type = state.getType(templateSpan.expression);
		if (!isDefinitelyType(state, type, templateSpan.expression, isStringType)) {
			if (isDefinitelyType(state, type, templateSpan.expression, isLuaTupleType(state))) {
				DiagnosticService.addDiagnostic(errors.noLuaTupleInTemplateExpression(templateSpan.expression));
			}
			if (ts.isCallExpression(templateSpan.expression) && isPossiblyType(type, isUndefinedType)) {
				expression = luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
			}
			expression = luau.call(luau.globals.tostring, [expression]);
		}
		expressions.push(expression);

		if (templateSpan.literal.text.length > 0) {
			expressions.push(createStringFromLiteral(templateSpan.literal));
		}
	}

	return binaryExpressionChain(expressions, "..");
}
