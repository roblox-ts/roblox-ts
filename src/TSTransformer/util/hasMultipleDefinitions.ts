import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

export function hasMultipleDeclarations(
	state: TransformState,
	symbol: ts.Symbol,
	filter: (declaration: ts.Declaration) => boolean,
	error?: ts.Diagnostic,
): boolean {
	let amtValueDefinitions = 0;
	for (const declaration of symbol.getDeclarations() ?? []) {
		if (filter(declaration)) {
			amtValueDefinitions++;
			if (amtValueDefinitions > 1) {
				if (error && !state.multiTransformState.isReportedByMultipleDefinitionsCache.has(symbol)) {
					state.multiTransformState.isReportedByMultipleDefinitionsCache.add(symbol);
					DiagnosticService.addDiagnostic(error);
				}
				return true;
			}
		}
	}
	return false;
}
