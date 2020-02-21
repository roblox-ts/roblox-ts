import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { transformOptionalChain } from "TSTransformer/util/optionalChain";
import ts from "typescript";

export function transformPropertyAccessExpressionInner(
	state: TransformState,
	expression: lua.IndexableExpression,
	name: string,
) {
	return lua.create(lua.SyntaxKind.PropertyAccessExpression, { expression, name });
}

export function transformPropertyAccessExpression(state: TransformState, node: ts.PropertyAccessExpression) {
	return transformOptionalChain(state, node);
}
