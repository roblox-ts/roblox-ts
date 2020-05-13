import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformParenthesizedExpression(state: TransformState, node: ts.ParenthesizedExpression) {
	const expression = transformExpression(state, skipDownwards(node.expression));
	if (lua.isSimple(expression)) {
		return expression;
	} else {
		return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
	}
}
