import { errors } from "Shared/diagnostics";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isAnyType, isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import ts from "typescript";

export function validateNotAnyType(state: TransformState, node: ts.Node) {
	if (ts.isSpreadElement(node)) {
		node = skipDownwards(node.expression);
	}

	const type = state.getType(node);
	const isAny = getOrSetDefault(state.multiTransformState.isAnyOrAnyArrayCache, type, () => {
		let checkedType = type;
		if (isDefinitelyType(type, isArrayType(state))) {
			// Array<T> -> T
			const indexType = state.typeChecker.getIndexTypeOfType(type, ts.IndexKind.Number);
			if (indexType) {
				checkedType = indexType;
			}
		}
		return isDefinitelyType(checkedType, isAnyType(state));
	});

	if (isAny) {
		// given a type like `a: { [index: string]: any }`, `a["b"]` will not have a symbol
		const symbol = getOriginalSymbolOfNode(state.typeChecker, node);
		if (symbol) {
			if (!state.multiTransformState.isReportedByNoAnyCache.has(symbol)) {
				state.multiTransformState.isReportedByNoAnyCache.add(symbol);
				DiagnosticService.addDiagnostic(errors.noAny(node));
			}
		} else {
			DiagnosticService.addDiagnostic(errors.noAny(node));
		}
	}
}
