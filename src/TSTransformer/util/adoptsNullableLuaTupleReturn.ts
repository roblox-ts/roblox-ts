import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { isLuaTupleType, isNullableLuaTupleType, walkTypes } from "TSTransformer/util/types";
import ts from "typescript";

/**
 * Unannotated function expressions returning `LuaTuple<T>` adopt a contextual `LuaTuple<T> | undefined` return,
 * so `run(() => pair())` boxes its result instead of requiring an annotated wrapper.
 */
export function adoptsNullableLuaTupleReturn(state: TransformState, node: ts.Node) {
	if (!(ts.isArrowFunction(node) || ts.isFunctionExpression(node)) || node.type) {
		return false;
	}

	const signature = state.typeChecker.getSignatureFromDeclaration(node);
	assert(signature);
	if (!isLuaTupleType(state)(state.typeChecker.getReturnTypeOfSignature(signature))) {
		return false;
	}

	const contextualType = state.typeChecker.getContextualType(node);
	if (!contextualType) {
		return false;
	}

	// a context mixing both conventions cannot choose one, so the assignment is still reported
	let hasNullable = false;
	let hasOther = false;
	walkTypes(state.typeChecker.getNonNullableType(contextualType), type => {
		for (const candidate of type.getCallSignatures()) {
			if (isNullableLuaTupleType(state)(state.typeChecker.getReturnTypeOfSignature(candidate))) {
				hasNullable = true;
			} else {
				hasOther = true;
			}
		}
	});
	return hasNullable && !hasOther;
}
