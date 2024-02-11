import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { canInlineArrayBindingPattern } from "TSTransformer/util/canOptimiseArrayBindingPattern";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
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
		canInlineArrayBindingPattern(state, parent.name)
	) {
		return false;
	}

	// `[a] = foo()`
	// If assignment is used as expression, direct assignment optimisation is skipped
	if (ts.isAssignmentExpression(parent) && ts.isArrayLiteralExpression(parent.left) && isUsedAsStatement(parent)) {
		return false;
	}

	// `foo()[n]`
	if (ts.isElementAccessExpression(parent)) {
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
	if (isLuaTupleType(state)(state.getType(node)) && shouldWrapLuaTuple(state, node, exp)) {
		return luau.array([exp]);
	}
	return exp;
}
