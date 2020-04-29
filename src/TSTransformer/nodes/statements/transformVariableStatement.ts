import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import ts from "byots";
import { assert } from "Shared/util/assert";

export function transformVariable(state: TransformState, identifier: ts.Identifier, value?: ts.Expression) {
	return state.statement(() => {
		// must transform right _before_ checking isHoisted, that way references inside of value can be hoisted
		const right = value ? transformExpression(state, value) : undefined;

		const symbol = state.typeChecker.getSymbolAtLocation(identifier);
		assert(symbol);
		if (state.isHoisted.get(symbol) === true) {
			// no need to do `x = nil` if the variable is already created
			if (right) {
				state.prereq(
					lua.create(lua.SyntaxKind.Assignment, {
						left: transformIdentifierDefined(state, identifier),
						right,
					}),
				);
			}
		} else {
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: transformIdentifierDefined(state, identifier),
					right,
				}),
			);
		}
	});
}

function transformVariableDeclaration(state: TransformState, node: ts.VariableDeclaration): lua.List<lua.Statement> {
	if (!ts.isIdentifier(node.name)) {
		assert(false, "Not implemented");
	}
	return transformVariable(state, node.name, node.initializer);
}

export function transformVariableStatement(state: TransformState, node: ts.VariableStatement): lua.List<lua.Statement> {
	const statements = lua.list.make<lua.Statement>();
	for (const declaration of node.declarationList.declarations) {
		lua.list.pushList(statements, transformVariableDeclaration(state, declaration));
	}
	return statements;
}
