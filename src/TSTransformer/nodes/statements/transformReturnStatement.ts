import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformReturnStatement(state: TransformState, node: ts.ReturnStatement) {
	const result = lua.list.make<lua.Statement>();

	const expression = node.expression
		? transformExpression(state, node.expression)
		: lua.create(lua.SyntaxKind.NilLiteral, {});
	lua.list.push(result, lua.create(lua.SyntaxKind.ReturnStatement, { expression }));

	return result;
}
