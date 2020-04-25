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

export function transformPropertyCallExpressionInner(
	state: TransformState,
	expression: lua.IndexableExpression,
	name: string,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const isMethod = true;

	const args = lua.list.make(...ensureTransformOrder(state, nodeArguments));
	if (isMethod) {
		return lua.create(lua.SyntaxKind.MethodCallExpression, { name, expression, args });
	} else {
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, { expression, name }),
			args,
		});
	}
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}
