import * as lua from "LuaAST";
import { transformIdentifier } from "TSTransformer/nodes/expressions/identifier";
import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";
import { transformStatementList } from "TSTransformer/util/transformStatementList";
import { transformParameters } from "TSTransformer/util/transformParameters";

export function transformFunctionDeclaration(state: TransformState, node: ts.FunctionDeclaration) {
	if (!node.name) {
		throw new Error("Unnamed functiond declaration?");
	}

	return lua.list.make(
		lua.create(lua.SyntaxKind.FunctionDeclaration, {
			name: transformIdentifier(state, node.name),
			hasDotDotDot: false,
			parameters: transformParameters(state, node.parameters),
			statements: transformStatementList(state, node.body?.statements ?? []),
		}),
	);
}
