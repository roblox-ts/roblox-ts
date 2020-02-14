import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";

export function transformPropertyAccessExpression(state: TransformState, node: ts.PropertyAccessExpression) {
	return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
		expression: convertToIndexableExpression(transformExpression(state, node.expression)),
		name: node.name.text,
	});
}
