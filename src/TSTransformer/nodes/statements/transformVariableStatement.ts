import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import ts from "typescript";

function transformVariableDeclaration(state: TransformState, node: ts.VariableDeclaration): lua.List<lua.Statement> {
	return state.statement(statements => {
		if (!ts.isIdentifier(node.name)) {
			throw new Error("Unsupported");
		}
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: transformIdentifierDefined(state, node.name),
				right: node.initializer ? transformExpression(state, node.initializer) : undefined,
			}),
		);
	});
}

export function transformVariableStatement(state: TransformState, node: ts.VariableStatement): lua.List<lua.Statement> {
	const statements = lua.list.make<lua.Statement>();
	for (const declaration of node.declarationList.declarations) {
		lua.list.pushList(statements, transformVariableDeclaration(state, declaration));
	}
	return statements;
}
