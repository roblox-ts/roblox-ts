import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformInterpolatedStringPart } from "TSTransformer/nodes/transformInterpolatedStringPart";
import { markInterpolatedStringPrimitive } from "TSTransformer/util/effects";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isBooleanType, isDefinitelyType, isNumberType, isStringType, isUndefinedType } from "TSTransformer/util/types";
import ts from "typescript";

export function transformTemplateExpression(state: TransformState, node: ts.TemplateExpression) {
	const parts = luau.list.make<luau.InterpolatedStringPart | luau.Expression>();

	if (node.head.text.length > 0) {
		luau.list.push(parts, transformInterpolatedStringPart(node.head));
	}

	const orderedExpressions = ensureTransformOrder(
		state,
		node.templateSpans.map(templateSpan => templateSpan.expression),
	);

	for (let i = 0; i < node.templateSpans.length; i++) {
		luau.list.push(parts, orderedExpressions[i]);

		const templateSpan = node.templateSpans[i];
		if (templateSpan.literal.text.length > 0) {
			luau.list.push(parts, transformInterpolatedStringPart(templateSpan.literal));
		}
	}

	const expression = luau.create(luau.SyntaxKind.InterpolatedString, { parts });

	// if every interpolated value is a primitive, formatting cannot invoke a `__tostring`
	// metamethod, so effect analysis may treat the interpolation itself as pure
	if (
		node.templateSpans.every(templateSpan =>
			isDefinitelyType(
				state.getType(templateSpan.expression),
				isStringType,
				isNumberType,
				isBooleanType,
				isUndefinedType,
			),
		)
	) {
		markInterpolatedStringPrimitive(expression);
	}

	return expression;
}
