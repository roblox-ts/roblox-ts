import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";

export function transformBooleanLiteral(state: TransformState, node: ts.BooleanLiteral) {
	return lua.create(
		node.kind === ts.SyntaxKind.TrueKeyword ? lua.SyntaxKind.TrueLiteral : lua.SyntaxKind.FalseLiteral,
		{},
	);
}

export function transformNumericLiteral(state: TransformState, node: ts.NumericLiteral) {
	return lua.create(lua.SyntaxKind.NumberLiteral, {
		value: Number(node.text),
	});
}

export function transformStringLiteral(state: TransformState, node: ts.StringLiteral) {
	return lua.create(lua.SyntaxKind.StringLiteral, {
		value: node.text,
	});
}
