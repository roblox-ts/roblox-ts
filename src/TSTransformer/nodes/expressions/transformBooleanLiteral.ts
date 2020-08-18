import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";

export function transformTrueKeyword(state: TransformState, node: ts.Token<ts.SyntaxKind.TrueKeyword>) {
	return luau.create(luau.SyntaxKind.TrueLiteral, {});
}

export function transformFalseKeyword(state: TransformState, node: ts.Token<ts.SyntaxKind.FalseKeyword>) {
	return luau.create(luau.SyntaxKind.FalseLiteral, {});
}
