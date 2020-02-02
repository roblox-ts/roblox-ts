import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformCallExpression } from "TSTransformer/nodes/expressions/callExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/identifier";
import { transformNumericLiteral, transformStringLiteral } from "TSTransformer/nodes/expressions/literal";
import { getKindName } from "TSTransformer/util/ast";
import ts from "typescript";

export function transformExpression(state: TransformState, node: ts.Expression): lua.Expression {
	if (ts.isIdentifier(node)) {
		return transformIdentifier(state, node);
	} else if (ts.isNumericLiteral(node)) {
		return transformNumericLiteral(state, node);
	} else if (ts.isStringLiteral(node)) {
		return transformStringLiteral(state, node);
	} else if (ts.isCallExpression(node)) {
		return transformCallExpression(state, node);
	}
	throw new Error(`Unknown expression: ${getKindName(node)}`);
}
