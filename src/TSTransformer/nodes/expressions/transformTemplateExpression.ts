import * as lua from "LuaAST";
import ts from "byots";
import { TransformState } from "TSTransformer/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { binaryExpressionChain } from "TSTransformer/util/binaryExpressionChain";

export function transformTemplateExpression(state: TransformState, node: ts.TemplateExpression) {
	if (node.templateSpans.length === 0) {
		return lua.string(node.head.text);
	}

	const expressions = lua.list.make<lua.Expression>();

	if (node.head.text.length > 0) {
		lua.list.push(expressions, lua.string(node.head.text));
	}

	for (const templateSpan of node.templateSpans) {
		lua.list.push(expressions, transformExpression(state, templateSpan.expression));

		if (templateSpan.literal.text.length > 0) {
			lua.list.push(expressions, lua.string(templateSpan.literal.text));
		}
	}

	return binaryExpressionChain(lua.list.toArray(expressions), "..");
}
