import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/util/transformInitializer";

export function transformParameters(state: TransformState, tsParams: ReadonlyArray<ts.ParameterDeclaration>) {
	const parameters = lua.list.make<lua.Identifier>();
	const statements = lua.list.make<lua.Statement>();
	let hasDotDotDot = false;

	for (const tsParam of tsParams) {
		assert(ts.isIdentifier(tsParam.name), "Not implemented");
		const paramId = transformIdentifierDefined(state, tsParam.name);
		if (tsParam.dotDotDotToken) {
			hasDotDotDot = true;
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: paramId,
					right: lua.create(lua.SyntaxKind.Array, {
						members: lua.list.make(lua.create(lua.SyntaxKind.VarArgsLiteral, {})),
					}),
				}),
			);
		} else {
			lua.list.push(parameters, paramId);
		}
		if (tsParam.initializer) {
			lua.list.push(statements, transformInitializer(state, paramId, tsParam.initializer));
		}
	}

	return {
		parameters,
		statements,
		hasDotDotDot,
	};
}
