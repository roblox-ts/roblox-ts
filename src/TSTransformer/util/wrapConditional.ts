import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import { TransformState } from "TSTransformer/TransformState";
import { pushToVarIfComplex } from "TSTransformer/util/pushToVar";

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

export function wrapConditional(state: TransformState, exp: lua.Expression, nodeType: tsst.SimpleType) {
	const checks = new Array<lua.Expression>();

	const isAssignableToZero = tsst.isAssignableToValue(nodeType, 0);
	const isAssignableToNaN = tsst.isAssignableToValue(nodeType, NaN);
	const isAssignableToEmptyString = tsst.isAssignableToValue(nodeType, "");

	if (isAssignableToZero || isAssignableToNaN || isAssignableToEmptyString) {
		exp = pushToVarIfComplex(state, exp);
	}

	if (isAssignableToZero) {
		checks.push(
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: exp,
				operator: lua.BinaryOperator.TildeEqual,
				right: lua.create(lua.SyntaxKind.NumberLiteral, { value: 0 }),
			}),
		);
	}

	if (isAssignableToNaN) {
		checks.push(
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: exp,
				operator: lua.BinaryOperator.EqualEqual,
				right: exp,
			}),
		);
	}

	if (isAssignableToEmptyString) {
		checks.push(
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: exp,
				operator: lua.BinaryOperator.TildeEqual,
				right: lua.create(lua.SyntaxKind.StringLiteral, { value: "" }),
			}),
		);
	}

	checks.push(exp);

	return binaryExpressionChain(checks, lua.BinaryOperator.And);
}
