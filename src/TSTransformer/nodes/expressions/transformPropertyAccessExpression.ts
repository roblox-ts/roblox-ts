import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { debugOptionalChain } from "TSTransformer/util/optionalChain";
import ts from "typescript";

export function transformPropertyAccessExpression(state: TransformState, node: ts.PropertyAccessExpression) {
	debugOptionalChain(state, node);
	return lua.tempId();

	const expression = convertToIndexableExpression(transformExpression(state, node.expression));
	return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
		expression,
		name: node.name.text,
	});
}
