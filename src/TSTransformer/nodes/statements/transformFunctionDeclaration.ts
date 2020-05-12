import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";

export function transformFunctionDeclaration(state: TransformState, node: ts.FunctionDeclaration) {
	if (!node.body) {
		return lua.list.make<lua.Statement>();
	}

	assert(node.name);
	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	assert(symbol);

	const localize = state.isHoisted.get(symbol) !== true;
	const name = transformIdentifierDefined(state, node.name);

	const { statements, parameters, hasDotDotDot } = transformParameters(state, node);

	lua.list.pushList(statements, transformStatementList(state, node.body.statements));

	return lua.list.make(
		lua.create(lua.SyntaxKind.FunctionDeclaration, { localize, name, statements, parameters, hasDotDotDot }),
	);
}
