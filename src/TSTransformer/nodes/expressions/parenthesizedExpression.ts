import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";

export function transformParenthesizedExpression(state: TransformState, node: ts.ParenthesizedExpression) {
	return lua.create(lua.SyntaxKind.ParenthesizedExpression, {
		expression: transformExpression(state, node.expression),
	});
}
