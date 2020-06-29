import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

export function transformTaggedTemplateExpression(state: TransformState, node: ts.TaggedTemplateExpression) {
	const tagExp = transformExpression(state, node.tag);

	if (ts.isTemplateExpression(node.template)) {
		const strings = luau.list.make<luau.Expression>();
		luau.list.push(strings, luau.string(node.template.head.text));
		for (const templateSpan of node.template.templateSpans) {
			luau.list.push(strings, luau.string(templateSpan.literal.text));
		}

		const expressions = luau.list.make(
			...ensureTransformOrder(
				state,
				node.template.templateSpans.map(templateSpan => templateSpan.expression),
			),
		);

		const args = luau.list.make<luau.Expression>();
		luau.list.push(
			args,
			luau.create(luau.SyntaxKind.Array, {
				members: strings,
			}),
		);
		luau.list.pushList(args, expressions);

		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: convertToIndexableExpression(tagExp),
			args,
		});
	} else {
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: convertToIndexableExpression(tagExp),
			args: luau.list.make(luau.array([luau.string(node.template.text)])),
		});
	}
}
