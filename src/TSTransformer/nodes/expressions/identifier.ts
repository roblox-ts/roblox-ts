import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export function transformIdentifier(state: TransformState, node: ts.Identifier): lua.Identifier {
	return lua.create(lua.SyntaxKind.Identifier, {
		name: node.text,
	});
}
