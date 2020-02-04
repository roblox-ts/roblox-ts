import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import { pushToVarIfComplex } from "TSTransformer/util/pushToVar";
import ts from "typescript";
import * as tsst from "ts-simple-type";

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
	const id = pushToVarIfComplex(state, transformExpression(state, node));
	const nodeType = tsst.toSimpleType(state.typeChecker.getTypeAtLocation(node), state.typeChecker);
	const checks = new Array<lua.Expression>();

	if (tsst.isAssignableToValue(nodeType, 0)) {
		checks.push(
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: id,
				operator: lua.BinaryOperator.TildeEqual,
				right: lua.create(lua.SyntaxKind.NumberLiteral, { value: 0 }),
			}),
		);
	}

	if (tsst.isAssignableToValue(nodeType, NaN)) {
		checks.push(
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: id,
				operator: lua.BinaryOperator.EqualEqual,
				right: id,
			}),
		);
	}

	if (tsst.isAssignableToValue(nodeType, "")) {
		checks.push(
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: id,
				operator: lua.BinaryOperator.TildeEqual,
				right: lua.create(lua.SyntaxKind.StringLiteral, { value: "" }),
			}),
		);
	}

	checks.push(id);

	return binaryExpressionChain(checks, lua.BinaryOperator.And);
}
