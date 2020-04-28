import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import ts from "byots";
import { assert } from "Shared/util/assert";

function transformVariableDeclaration(state: TransformState, node: ts.VariableDeclaration): lua.List<lua.Statement> {
	return state.statement(() => {
		if (!ts.isIdentifier(node.name)) {
			assert(false, "Not implemented");
		}

		// must transform right _before_ checking isHoisted
		const right = node.initializer ? transformExpression(state, node.initializer) : undefined;

		const symbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(symbol);
		if (state.isHoisted.get(symbol) === true) {
			if (right) {
				state.prereq(
					lua.create(lua.SyntaxKind.Assignment, {
						left: transformIdentifierDefined(state, node.name),
						right,
					}),
				);
			}
		} else {
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: transformIdentifierDefined(state, node.name),
					right,
				}),
			);
		}
	});
}

export function transformVariableStatement(state: TransformState, node: ts.VariableStatement): lua.List<lua.Statement> {
	const statements = lua.list.make<lua.Statement>();
	for (const declaration of node.declarationList.declarations) {
		lua.list.pushList(statements, transformVariableDeclaration(state, declaration));
	}
	return statements;
}
