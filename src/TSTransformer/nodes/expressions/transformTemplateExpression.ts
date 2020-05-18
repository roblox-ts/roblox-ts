import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
import { isStringType } from "TSTransformer/util/types";

export function transformTemplateExpression(state: TransformState, node: ts.TemplateExpression) {
	if (node.templateSpans.length === 0) {
		return lua.string(node.head.text);
	}

	const expressions = new Array<lua.Expression>();

	if (node.head.text.length > 0) {
		expressions.push(lua.string(node.head.text));
	}

	const orderedExpressions = ensureTransformOrder(
		state,
		node.templateSpans.map(templateSpan => templateSpan.expression),
	);

	for (let i = 0; i < node.templateSpans.length; i++) {
		const templateSpan = node.templateSpans[i];
		let exp = orderedExpressions[i];
		if (!isStringType(state, state.getType(templateSpan.expression))) {
			exp = lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.tostring,
				args: lua.list.make(exp),
			});
		}
		expressions.push(exp);

		if (templateSpan.literal.text.length > 0) {
			expressions.push(lua.string(templateSpan.literal.text));
		}
	}

	return binaryExpressionChain(expressions, "..");
}
