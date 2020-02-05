import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import ts from "typescript";

function transformParamInitializer(state: TransformState, paramId: lua.Identifier, initializer: ts.Expression) {
	return lua.create(lua.SyntaxKind.IfStatement, {
		condition: lua.create(lua.SyntaxKind.BinaryExpression, {
			left: paramId,
			operator: lua.BinaryOperator.EqualEqual,
			right: lua.create(lua.SyntaxKind.NilLiteral, {}),
		}),
		elseBody: lua.list.make(),
		statements: state.statement(initializerStatements => {
			lua.list.push(
				initializerStatements,
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
		if (!ts.isIdentifier(tsParam.name)) {
			throw new Error();
		}
		const paramStatements = lua.list.make<lua.Statement>();
		const paramId = transformIdentifier(state, tsParam.name, true);
		if (tsParam.dotDotDotToken) {
			hasDotDotDot = true;
			lua.list.push(
				paramStatements,
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
			lua.list.push(paramStatements, transformParamInitializer(state, paramId, tsParam.initializer));
		}
		lua.list.pushList(statements, paramStatements);
	}

	return {
		parameters,
		statements,
		hasDotDotDot,
	};
}
