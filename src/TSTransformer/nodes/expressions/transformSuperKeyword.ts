import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";

export function transformSuperKeyword(state: TransformState, node: ts.Token<ts.SyntaxKind.SuperKeyword>) {
	return luau.globals.super;
}
