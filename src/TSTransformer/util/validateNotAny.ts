import ts from "byots";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isAnyType, isArrayType, isDefinitelyType } from "TSTransformer/util/types";

export function validateNotAnyType(state: TransformState, node: ts.Node) {
	if (ts.isSpreadElement(node)) {
		node = skipDownwards(node.expression);
	}

	let type = state.getType(node);

	if (isDefinitelyType(type, t => isArrayType(state, t))) {
		// Array<T> -> T
		const indexType = state.typeChecker.getIndexTypeOfType(type, ts.IndexKind.Number);
		if (indexType) {
			type = indexType;
		}
	}

	if (isDefinitelyType(type, t => isAnyType(t))) {
		state.addDiagnostic(errors.noAny(node));
	}
}
