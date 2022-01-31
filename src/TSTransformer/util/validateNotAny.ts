import { TransformState } from "TSTransformer";
import { isAnyType, isDefinitelyType } from "TSTransformer/util/types";
import ts from "typescript";

/**
 * Should only be used in cases where any counts for TS correctness.
 * For example, `a++` is valid if `a` is `number` or `any`, but nothing else.
 * In this case, we only need to check that the type is not `any`
 * to guarantee that it will be a `number`.
 * Since we then don't use isDefinitelyType, we call this instead
 */
export function validateNotAnyType(state: TransformState, node: ts.Node) {
	// no-any checks are automatically done in isDefinitelyType
	// therefore, calling it will report the diagnostic
	// and we can discard the result
	isDefinitelyType(state, state.getType(node), node, isAnyType(state.typeChecker));
}
