import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";

function createInterpolatedStringPart(node: ts.TemplateLiteralToken | ts.StringLiteral) {
	return luau.create(luau.SyntaxKind.InterpolatedStringPart, { text: createStringFromLiteral(node) });
}

// backtick string literals without interpolation expressions should be preserved
// as they still are valid in luau
export function transformNoSubstitutionTemplateLiteral(state: TransformState, node: ts.NoSubstitutionTemplateLiteral) {
	return luau.create(luau.SyntaxKind.InterpolatedString, {
		parts: luau.list.make(createInterpolatedStringPart(node)),
	});
}

export function transformTemplateExpression(state: TransformState, node: ts.TemplateExpression) {
	const parts = luau.list.make<luau.InterpolatedStringPart | luau.Expression>();

	if (node.head.text.length > 0) {
		luau.list.push(parts, createInterpolatedStringPart(node.head));
	}

	const orderedExpressions = ensureTransformOrder(
		state,
		node.templateSpans.map(templateSpan => templateSpan.expression),
	);

	for (let i = 0; i < node.templateSpans.length; i++) {
		const templateSpan = node.templateSpans[i];
		const expression = orderedExpressions[i];

		luau.list.push(parts, expression);

		if (templateSpan.literal.text.length > 0) {
			luau.list.push(parts, createInterpolatedStringPart(templateSpan.literal));
		}
	}

	return luau.create(luau.SyntaxKind.InterpolatedString, { parts });
}
