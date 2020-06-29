import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";

export function transformTrueKeyword(state: TransformState, node: ts.Token<ts.SyntaxKind.TrueKeyword>) {
	return luau.create(luau.SyntaxKind.TrueLiteral, {});
}

export function transformFalseKeyword(state: TransformState, node: ts.Token<ts.SyntaxKind.FalseKeyword>) {
	return luau.create(luau.SyntaxKind.FalseLiteral, {});
}

export function transformNumericLiteral(state: TransformState, node: ts.NumericLiteral) {
	return luau.create(luau.SyntaxKind.NumberLiteral, {
		value: Number(node.text),
	});
}

export function transformStringLiteral(
	state: TransformState,
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
) {
	return createStringFromLiteral(node);
}
