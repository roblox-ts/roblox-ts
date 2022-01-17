import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";

export function transformTaggedTemplateExpression(state: TransformState, node: ts.TaggedTemplateExpression) {
	const tagExp = transformExpression(state, node.tag);

	if (ts.isTemplateExpression(node.template)) {
		const strings = new Array<luau.Expression>();
		strings.push(luau.string(node.template.head.text));
		for (const templateSpan of node.template.templateSpans) {
			strings.push(luau.string(templateSpan.literal.text));
		}

		const expressions = ensureTransformOrder(
			state,
			node.template.templateSpans.map(templateSpan => templateSpan.expression),
		);

		return luau.call(convertToIndexableExpression(tagExp), [luau.array(strings), ...expressions]);
	} else {
		return luau.call(convertToIndexableExpression(tagExp), [luau.array([luau.string(node.template.text)])]);
	}
}
