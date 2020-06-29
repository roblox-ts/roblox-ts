import ts from "byots";
import luau from "LuauAST";
import * as tsst from "ts-simple-type";
import { TransformState } from "TSTransformer";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";

export function willCreateTruthinessChecks(state: TransformState, nodeType: ts.Type) {
	const simpleType = state.getSimpleType(nodeType);
	const isAssignableToZero = tsst.isAssignableToValue(simpleType, 0);
	const isAssignableToNaN = tsst.isAssignableToValue(simpleType, NaN);
	const isAssignableToEmptyString = tsst.isAssignableToValue(simpleType, "");
	return isAssignableToZero || isAssignableToNaN || isAssignableToEmptyString;
}

export function createTruthinessChecks(state: TransformState, exp: luau.Expression, nodeType: ts.Type) {
	const checks = new Array<luau.Expression>();

	const simpleType = state.getSimpleType(nodeType);
	const isAssignableToZero = tsst.isAssignableToValue(simpleType, 0);
	const isAssignableToNaN = tsst.isAssignableToValue(simpleType, NaN);
	const isAssignableToEmptyString = tsst.isAssignableToValue(simpleType, "");

	if (isAssignableToZero || isAssignableToNaN || isAssignableToEmptyString) {
		exp = state.pushToVarIfComplex(exp);
	}

	if (isAssignableToZero) {
		checks.push(luau.binary(exp, "~=", luau.create(luau.SyntaxKind.NumberLiteral, { value: 0 })));
	}

	// workaround for https://github.com/microsoft/TypeScript/issues/32778
	if (isAssignableToZero || isAssignableToNaN) {
		checks.push(luau.binary(exp, "==", exp));
	}

	if (isAssignableToEmptyString) {
		checks.push(luau.binary(exp, "~=", luau.create(luau.SyntaxKind.StringLiteral, { value: "" })));
	}

	checks.push(exp);

	return binaryExpressionChain(checks, "and");
}
