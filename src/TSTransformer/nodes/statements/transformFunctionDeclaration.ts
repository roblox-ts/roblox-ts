import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformParameters } from "TSTransformer/util/transformParameters";
import { transformStatementList } from "TSTransformer/util/transformStatementList";
import ts from "typescript";
import { assert } from "Shared/util/assert";

export function transformFunctionDeclaration(state: TransformState, node: ts.FunctionDeclaration) {
	assert(node.name);
	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	assert(symbol);

	const { statements, parameters, hasDotDotDot } = transformParameters(state, node.parameters);

	return lua.list.make(
		lua.create(lua.SyntaxKind.FunctionDeclaration, {
			localize: state.isHoisted.get(symbol) !== true,
			name: transformIdentifierDefined(state, node.name),
			hasDotDotDot,
			parameters,
			statements: lua.list.join(statements, transformStatementList(state, node.body?.statements ?? [])),
		}),
	);
}
