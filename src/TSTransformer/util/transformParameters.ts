import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import ts from "typescript";

function transformParamInitializer(state: TransformState, paramId: lua.Identifier, initializer: ts.Expression) {
	return lua.create(lua.SyntaxKind.IfStatement, {
		condition: lua.create(lua.SyntaxKind.BinaryExpression, {
			left: paramId,
			operator: "==",
			right: lua.nil(),
		}),
		elseBody: lua.list.make(),
		statements: state.statement(() => {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: paramId,
					right: transformExpression(state, initializer),
				}),
			);
		}),
	});
}

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
			lua.list.push(statements, transformParamInitializer(state, paramId, tsParam.initializer));
		}
	}

	return {
		parameters,
		statements,
		hasDotDotDot,
	};
}
