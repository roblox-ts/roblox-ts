import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { arrayBindingPatternContainsHoists } from "TSTransformer/util/arrayBindingPatternContainsHoists";
import { arrayLikeExpressionContainsSpread } from "TSTransformer/util/arrayLikeExpressionContainsSpread";
import { skipUpwards } from "TSTransformer/util/traversal";
import { isLuaTupleType } from "TSTransformer/util/types";
import ts from "typescript";

function shouldWrapLuaTuple(state: TransformState, node: ts.CallExpression, exp: luau.Expression) {
	if (!luau.isCall(exp)) {
		return true;
	}

	const child = skipUpwards(node);
	const parent = child.parent;

	// `foo();`
	if (ts.isExpressionStatement(parent)) {
		return false;
	}

	// if part of for statement definition, except if used as the condition
	if (ts.isForStatement(parent) && parent.condition !== child) {
		return false;
	}

	// `const [a] = foo()`
	if (
		ts.isVariableDeclaration(parent) &&
		ts.isArrayBindingPattern(parent.name) &&
		!arrayBindingPatternContainsHoists(state, parent.name) &&
		!arrayLikeExpressionContainsSpread(parent.name) &&
		node.questionDotToken === undefined
	) {
		return false;
	}

	// `[a] = foo()`
	if (
		ts.isAssignmentExpression(parent) &&
		ts.isArrayLiteralExpression(parent.left) &&
		!arrayLikeExpressionContainsSpread(parent.left) &&
		node.questionDotToken === undefined
	) {
		return false;
	}

	// `foo()[n]`
	if (ts.isElementAccessExpression(parent) && parent.questionDotToken === undefined) {
		return false;
	}

	// `return foo()`
	if (ts.isReturnStatement(parent)) {
		return false;
	}

	// `void foo()`
	if (ts.isVoidExpression(parent)) {
		return false;
	}

	return true;
}

export function wrapReturnIfLuaTuple(state: TransformState, node: ts.CallExpression, exp: luau.Expression) {
	if (
		isLuaTupleType(state)(state.typeChecker.getNonNullableType(state.getType(node))) &&
		shouldWrapLuaTuple(state, node, exp)
	) {
		return luau.array([exp]);
	}
	return exp;
}
