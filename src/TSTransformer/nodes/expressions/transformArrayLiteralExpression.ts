import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";

export function transformArrayLiteralExpression(state: TransformState, node: ts.ArrayLiteralExpression) {
	return lua.create(lua.SyntaxKind.Array, {
		members: lua.list.make(...ensureTransformOrder(state, node.elements)),
	});
}
