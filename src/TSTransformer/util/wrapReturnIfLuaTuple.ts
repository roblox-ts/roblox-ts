import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { arrayBindingPatternContainsHoists } from "TSTransformer/util/arrayBindingPatternContainsHoists";
import { arrayLikeExpressionContainsSpread } from "TSTransformer/util/arrayLikeExpressionContainsSpread";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { skipUpwards } from "TSTransformer/util/traversal";
import { isLuaTupleType } from "TSTransformer/util/types";
import ts from "typescript";

function shouldWrapLuaTuple(state: TransformState, node: ts.CallExpression) {
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

	// optional calls store a tuple table inside the guarded branch
	if (ts.isOptionalChain(node)) {
		return true;
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

export function wrapReturnIfLuaTuple(
	state: TransformState,
	node: ts.CallExpression,
	exp: luau.CallExpression | luau.MethodCallExpression,
) {
	// assertions and optional-chain markers do not change the callee's return convention
	let type = state.typeChecker.getTypeAtLocation(node);
	if (ts.isOptionalChain(node)) {
		// the resolved outer call includes undefined even when the selected overload always returns a tuple
		const signature = state.typeChecker.getResolvedSignature(node);
		assert(signature);
		const calleeType = state.typeChecker.getNonNullableType(state.typeChecker.getTypeAtLocation(node.expression));
		const returnsTuple = calleeType
			.getCallSignatures()
			.some(
				candidate =>
					candidate.declaration === signature.declaration &&
					isLuaTupleType(state)(state.typeChecker.getReturnTypeOfSignature(candidate)),
			);
		if (returnsTuple) {
			type = state.typeChecker.getNonNullableType(type);
		}
	}
	if (isLuaTupleType(state)(type)) {
		if (shouldWrapLuaTuple(state, node)) {
			return luau.array([exp]);
		}
	} else if (isLuaTupleType(state)(state.typeChecker.getNonNullableType(type)) && !isUsedAsStatement(node)) {
		// prevent a narrowed nullable result from being expanded as multiple returns
		return luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression: exp });
	}
	return exp;
}
