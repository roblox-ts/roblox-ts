import ts from "byots";
import { TransformState } from "TSTransformer";
import { diagnostics } from "Shared/diagnostics";
import { isAnyType, isArrayType, getTypeArguments } from "TSTransformer/util/types";

export function validateNotAnyType(state: TransformState, node: ts.Node) {
	let type = state.getType(node);

	if (isArrayType(state, type)) {
		const typeArguments = getTypeArguments(state, type);
		if (typeArguments.length > 0) {
			type = typeArguments[0];
		}
	}

	if (isAnyType(type)) {
		state.addDiagnostic(diagnostics.noAny(node));
	}
}
