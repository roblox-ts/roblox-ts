import { TransformState } from "TSTransformer";
import { isDefinitelyType } from "TSTransformer/util/types";
import ts from "typescript";

/**
 * Should only be used in cases where `any` counts for TS correctness.
 * For example, `a++` is valid if `a` is `number` or `any`, but nothing else.
 * In this case, we only need to check that the type is not `any`
 * to guarantee that it will be a `number`.
 * Since we then don't use isDefinitelyType, we call this instead
 */
export function validateNotAnyType(state: TransformState, node: ts.Node) {
	// noAny checks are automatically done in isDefinitelyType
	// therefore, calling it will report the diagnostic
	// and we can discard the result.

	// We don't need to pass any typechecks
	// Since `any` is never a union/intersection type
	// And the case for single types checks for `any` directly
	isDefinitelyType(state, state.getType(node), node);
}
