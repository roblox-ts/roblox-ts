import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureExecutionOrder } from "TSTransformer/util/ensureExecutionOrder";
import ts from "typescript";

export function transformCallExpression(state: TransformState, node: ts.CallExpression): lua.CallExpression {
	const expression = convertToIndexableExpression(transformExpression(state, node.expression));
	const args = lua.list.make(...ensureExecutionOrder(state, node.arguments));
	return lua.create(lua.SyntaxKind.CallExpression, { expression, args });
}
