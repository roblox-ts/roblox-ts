import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { findLastIndex } from "Shared/util/findLastIndex";
import ts from "typescript";

function convertToIndexableExpression(expression: lua.Expression) {
	if (lua.isIndexableExpression(expression)) {
		return expression;
	}
	return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
}

function transformArguments(state: TransformState, args: ReadonlyArray<ts.Expression>) {
	const argsList = args.map(arg => state.capturePrereqs(() => transformExpression(state, arg)));
	const lastArgsIndexWithPrereqs = findLastIndex(argsList, item => lua.list.isEmpty(item.statements));

	const result = lua.list.make<lua.Expression>();

	for (let i = 0; i <= lastArgsIndexWithPrereqs; i++) {}

	for (const arg of args) {
		lua.list.push(result, transformExpression(state, arg));
	}
	return result;
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression): lua.CallExpression {
	const expression = convertToIndexableExpression(transformExpression(state, node.expression));
	const args = transformArguments(state, node.arguments);
	return lua.create(lua.SyntaxKind.CallExpression, { expression, args });
}
