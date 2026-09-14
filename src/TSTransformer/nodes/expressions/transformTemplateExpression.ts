import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformInterpolatedStringPart } from "TSTransformer/nodes/transformInterpolatedStringPart";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";

export function transformTemplateExpression(state: TransformState, prereqs: Prereqs, node: ts.TemplateExpression) {
	const parts = luau.list.make<luau.InterpolatedStringPart | luau.Expression>();

	if (node.head.text.length > 0) {
		luau.list.push(parts, transformInterpolatedStringPart(node.head));
	}

	const orderedExpressions = ensureTransformOrder(
		state,
		prereqs,
		node.templateSpans.map(templateSpan => templateSpan.expression),
	);

	for (let i = 0; i < node.templateSpans.length; i++) {
		luau.list.push(parts, orderedExpressions[i]);

		const templateSpan = node.templateSpans[i];
		if (templateSpan.literal.text.length > 0) {
			luau.list.push(parts, transformInterpolatedStringPart(templateSpan.literal));
		}
	}

	return luau.create(luau.SyntaxKind.InterpolatedString, { parts });
}
