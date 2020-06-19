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

	const isExportDefault = !!(node.modifierFlagsCache & ts.ModifierFlags.ExportDefault);

	assert(node.name || isExportDefault, "Function declaration had no name and was not an export default");

	let localize = isExportDefault;
	if (node.name) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(symbol, "Could not find symbol for node.name");
		localize = state.isHoisted.get(symbol) !== true;
	}

	const name = node.name ? transformIdentifierDefined(state, node.name) : lua.id("default");

	const { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	lua.list.pushList(statements, transformStatementList(state, node.body.statements));

	if (!!(node.modifierFlagsCache & ts.ModifierFlags.Async)) {
		return lua.list.make(
			lua.create(localize ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
				left: name,
				right: lua.create(lua.SyntaxKind.CallExpression, {
					expression: state.TS("async"),
					args: lua.list.make(
						lua.create(lua.SyntaxKind.FunctionExpression, {
							hasDotDotDot,
							parameters,
							statements,
						}),
					),
				}),
			}),
		);
	} else {
		return lua.list.make(
			lua.create(lua.SyntaxKind.FunctionDeclaration, { localize, name, statements, parameters, hasDotDotDot }),
		);
	}
}
