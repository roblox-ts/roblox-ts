import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";

export function transformTrueKeyword(state: TransformState, node: ts.Token<ts.SyntaxKind.TrueKeyword>) {
	return lua.create(lua.SyntaxKind.TrueLiteral, {});
}

export function transformFalseKeyword(state: TransformState, node: ts.Token<ts.SyntaxKind.FalseKeyword>) {
	return lua.create(lua.SyntaxKind.FalseLiteral, {});
}

export function transformNumericLiteral(state: TransformState, node: ts.NumericLiteral) {
	return lua.create(lua.SyntaxKind.NumberLiteral, {
		value: Number(node.text),
	});
}

export function transformStringLiteral(
	state: TransformState,
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
) {
	return createStringFromLiteral(node);
}
