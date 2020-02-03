import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import ts from "typescript";

export function transformParenthesizedExpression(state: TransformState, node: ts.ParenthesizedExpression) {
	return lua.create(lua.SyntaxKind.ParenthesizedExpression, {
		expression: transformExpression(state, node.expression),
	});
}
