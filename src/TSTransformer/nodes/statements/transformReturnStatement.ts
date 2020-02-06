import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformReturnStatement(state: TransformState, node: ts.ReturnStatement) {
	return lua.list.make(
		lua.create(lua.SyntaxKind.ReturnStatement, {
			expression: node.expression ? transformExpression(state, node.expression) : lua.nil(),
		}),
	);
}
