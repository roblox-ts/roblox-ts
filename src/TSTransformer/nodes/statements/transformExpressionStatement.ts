import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const result = lua.list.make<lua.Statement>();

	const expression = transformExpression(state, node.expression);
	if (lua.isCallExpression(expression) || lua.isMethodCallExpression(expression)) {
		lua.list.push(result, lua.create(lua.SyntaxKind.CallStatement, { expression }));
	} else {
		lua.list.push(
			result,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.create(lua.SyntaxKind.Identifier, { name: "_" }),
				right: expression,
			}),
		);
	}

	return result;
}
