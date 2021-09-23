import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
import { isDefinitelyType, isStringType } from "TSTransformer/util/types";
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
		let exp = orderedExpressions[i];
		if (!isDefinitelyType(state.getType(templateSpan.expression), t => isStringType(t))) {
			exp = luau.call(luau.globals.tostring, [exp]);
		}
		expressions.push(exp);

		if (templateSpan.literal.text.length > 0) {
			expressions.push(createStringFromLiteral(templateSpan.literal));
		}
	}

	return binaryExpressionChain(expressions, "..");
}
