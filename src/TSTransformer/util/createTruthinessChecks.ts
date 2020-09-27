import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
import { isNumberType, isPossiblyType, isStringType } from "TSTransformer/util/types";

function checkIsAssignableToZero(type: ts.Type) {
	return isPossiblyType(type, t => {
		if (t.isNumberLiteral()) {
			return t.value === 0;
		}
		return isNumberType(t);
	});
}

function checkIsAssignableToNaN(type: ts.Type) {
	return isPossiblyType(type, t => isNumberType(t));
}

function checkIsAssignableToEmptyString(type: ts.Type) {
	return isPossiblyType(type, t => {
		if (t.isStringLiteral()) {
			return t.value === "";
		}
		return isStringType(t);
	});
}

export function willCreateTruthinessChecks(type: ts.Type) {
	return checkIsAssignableToZero(type) || checkIsAssignableToNaN(type) || checkIsAssignableToEmptyString(type);
}

export function createTruthinessChecks(state: TransformState, exp: luau.Expression, type: ts.Type) {
	const isAssignableToZero = checkIsAssignableToZero(type);
	const isAssignableToNaN = checkIsAssignableToNaN(type);
	const isAssignableToEmptyString = checkIsAssignableToEmptyString(type);

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
