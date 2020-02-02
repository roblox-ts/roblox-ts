import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";

function convertToIndexableExpression(expression: lua.Expression) {
	if (lua.isIndexableExpression(expression)) {
		return expression;
	}
	return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
}

function transformArguments(state: TransformState, args: ReadonlyArray<ts.Expression>) {
	const argsList = lua.list.make<lua.Expression>();
	for (const arg of args) {
		lua.list.push(argsList, transformExpression(state, arg));
	}
	return argsList;
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression): lua.CallExpression {
	const expression = convertToIndexableExpression(transformExpression(state, node.expression));
	const args = transformArguments(state, node.arguments);
	return lua.create(lua.SyntaxKind.CallExpression, { expression, args });
}
