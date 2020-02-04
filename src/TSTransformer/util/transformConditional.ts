import { TransformState } from "TSTransformer";
import ts from "typescript";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import { pushToVarIfNonId } from "TSTransformer/util/pushToVarIfNonId";

function binaryExpressionChain(expressions: Array<lua.Expression>, operator: lua.BinaryOperator): lua.Expression {
	if (expressions.length === 1) {
		return expressions[0];
	} else {
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: expressions[0],
			operator,
			right: binaryExpressionChain(expressions.slice(1), operator),
		});
	}
}

export function transformConditional(state: TransformState, node: ts.Expression) {
	const id = pushToVarIfNonId(state, transformExpression(state, node));

	const isNonZero = lua.create(lua.SyntaxKind.BinaryExpression, {
		left: id,
		operator: lua.BinaryOperator.TildeEqual,
		right: lua.create(lua.SyntaxKind.NumberLiteral, { value: 0 }),
	});

	const isNonNaN = lua.create(lua.SyntaxKind.BinaryExpression, {
		left: id,
		operator: lua.BinaryOperator.EqualEqual,
		right: id,
	});

	return binaryExpressionChain([isNonZero, isNonNaN, id], lua.BinaryOperator.And);
}
