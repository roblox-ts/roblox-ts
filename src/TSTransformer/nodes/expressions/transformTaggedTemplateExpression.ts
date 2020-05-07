import ts from "byots";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

export function transformTaggedTemplateExpression(state: TransformState, node: ts.TaggedTemplateExpression) {
	const tagExp = transformExpression(state, node.tag);

	if (ts.isTemplateExpression(node.template)) {
		const strings = lua.list.make<lua.Expression>();
		lua.list.push(strings, lua.string(node.template.head.text));
		for (const templateSpan of node.template.templateSpans) {
			lua.list.push(strings, lua.string(templateSpan.literal.text));
		}

		const expressions = lua.list.make(
			...ensureTransformOrder(
				state,
				node.template.templateSpans.map(templateSpan => templateSpan.expression),
			),
		);

		const args = lua.list.make<lua.Expression>();
		lua.list.push(
			args,
			lua.create(lua.SyntaxKind.Array, {
				members: strings,
			}),
		);
		lua.list.pushList(args, expressions);

		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: convertToIndexableExpression(tagExp),
			args,
		});
	} else {
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: convertToIndexableExpression(tagExp),
			args: lua.list.make(lua.array([lua.string(node.template.text)])),
		});
	}
}
