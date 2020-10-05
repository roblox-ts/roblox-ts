import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
import { isEmptyStringType, isNaNType, isNumberLiteralType, isPossiblyType } from "TSTransformer/util/types";

export function willCreateTruthinessChecks(type: ts.Type) {
	return (
		isPossiblyType(type, t => isNumberLiteralType(t, 0)) ||
		isPossiblyType(type, t => isNaNType(t)) ||
		isPossiblyType(type, t => isEmptyStringType(t))
	);
}

export function createTruthinessChecks(state: TransformState, exp: luau.Expression, type: ts.Type) {
	const isAssignableToZero = isPossiblyType(type, t => isNumberLiteralType(t, 0));
	const isAssignableToNaN = isPossiblyType(type, t => isNaNType(t));
	const isAssignableToEmptyString = isPossiblyType(type, t => isEmptyStringType(t));

	if (isAssignableToZero || isAssignableToNaN || isAssignableToEmptyString) {
		exp = state.pushToVarIfComplex(exp);
	}

	const checks = new Array<luau.Expression>();

	if (isAssignableToZero) {
		checks.push(luau.binary(exp, "~=", luau.number(0)));
	}

	// workaround for https://github.com/microsoft/TypeScript/issues/32778
	if (isAssignableToZero || isAssignableToNaN) {
		checks.push(luau.binary(exp, "==", exp));
	}

	if (isAssignableToEmptyString) {
		checks.push(luau.binary(exp, "~=", luau.string("")));
	}

	checks.push(exp);

	return binaryExpressionChain(checks, "and");
}
