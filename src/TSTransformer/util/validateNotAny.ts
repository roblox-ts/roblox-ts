import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isAnyType, isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import ts from "typescript";

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
		const symbol = state.getOriginalSymbol(node);
		if (symbol && !state.multiTransformState.isReportedByNoAnyCache.has(symbol)) {
			state.multiTransformState.isReportedByNoAnyCache.add(symbol);
			DiagnosticService.addDiagnostic(errors.noAny(node));
		}
	}
}
