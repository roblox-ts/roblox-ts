import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformIdentifier } from "TSTransformer/nodes/expressions/identifier";
import { transformParameters } from "TSTransformer/util/transformParameters";
import { transformStatementList } from "TSTransformer/util/transformStatementList";
import ts from "typescript";

export function transformFunctionDeclaration(state: TransformState, node: ts.FunctionDeclaration) {
	if (!node.name) {
		throw new Error("Unnamed functiond declaration?");
	}

	const { statements, parameters, hasDotDotDot } = transformParameters(state, node.parameters);

	return lua.list.make(
		lua.create(lua.SyntaxKind.FunctionDeclaration, {
			name: transformIdentifier(state, node.name),
			hasDotDotDot,
			parameters,
			statements: lua.list.join(statements, transformStatementList(state, node.body?.statements ?? [])),
		}),
	);
}
