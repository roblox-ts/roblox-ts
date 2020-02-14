import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export function transformIdentifierDefined(state: TransformState, node: ts.Identifier) {
	return lua.create(lua.SyntaxKind.Identifier, {
		name: node.text,
	});
}

export function transformIdentifier(state: TransformState, node: ts.Identifier): lua.Identifier | lua.NilLiteral {
	if (node.text === "undefined") {
		return lua.nil();
	}
	return transformIdentifierDefined(state, node);
}
