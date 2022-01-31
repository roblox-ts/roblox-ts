import { TransformState } from "TSTransformer";
import { addDiagnosticIfNotCached } from "TSTransformer/util/addDiagnosticIfNotCached";
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
				if (error) {
					addDiagnosticIfNotCached(
						symbol,
						error,
						state.multiTransformState.isReportedByMultipleDefinitionsCache,
					);
				}
				return true;
			}
		}
	}
	return false;
}
