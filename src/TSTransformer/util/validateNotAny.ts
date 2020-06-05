import ts from "byots";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { skipDownwards } from "TSTransformer/util/traversal";
import { getTypeArguments, isAnyType, isArrayType } from "TSTransformer/util/types";

export function validateNotAnyType(state: TransformState, node: ts.Node) {
	if (ts.isSpreadElement(node)) {
		node = skipDownwards(node.expression);
	}

	let type = state.getType(node);

	if (isArrayType(state, type)) {
		// Array<T> -> T
		const typeArguments = getTypeArguments(state, type);
		if (typeArguments.length > 0) {
			type = typeArguments[0];
		}
	}

	if (isAnyType(type)) {
		state.addDiagnostic(diagnostics.noAny(node));
	}
}
