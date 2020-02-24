import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { transformOptionalChain } from "TSTransformer/util/optionalChain";
import ts from "typescript";

export function transformCallExpressionInner(
	state: TransformState,
	expression: lua.IndexableExpression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const args = lua.list.make(...ensureTransformOrder(state, nodeArguments));
	return lua.create(lua.SyntaxKind.CallExpression, { expression, args });
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}
