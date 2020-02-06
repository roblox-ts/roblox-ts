import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export function transformIdentifier(state: TransformState, node: ts.Identifier, forceId: true): lua.Identifier;
export function transformIdentifier(
	state: TransformState,
	node: ts.Identifier,
	forceId?: boolean,
): lua.Identifier | lua.NilLiteral;
export function transformIdentifier(state: TransformState, node: ts.Identifier): lua.Identifier | lua.NilLiteral {
	if (node.text === "undefined") {
		return lua.nil();
	}
	return lua.create(lua.SyntaxKind.Identifier, {
		name: node.text,
	});
}
