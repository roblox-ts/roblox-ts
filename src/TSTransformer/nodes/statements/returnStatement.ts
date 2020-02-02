import { TransformState } from "TSTransformer";
import ts from "typescript";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";

export function transformReturnStatement(state: TransformState, node: ts.ReturnStatement) {
	const result = lua.list.make<lua.Statement>();

	const expression = node.expression
		? transformExpression(state, node.expression)
		: lua.create(lua.SyntaxKind.NilLiteral, {});
	lua.list.push(result, lua.create(lua.SyntaxKind.ReturnStatement, { expression }));

	return result;
}
