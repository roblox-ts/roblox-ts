import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

export function addDiagnosticIfNotCached(symbol: ts.Symbol, error: ts.Diagnostic, cache: Set<ts.Symbol>) {
	if (!cache.has(symbol)) {
		cache.add(symbol);
		DiagnosticService.addDiagnostic(error);
	}
}

export function addDiagnosticFromNodeIfNotCached(
	state: TransformState,
	node: ts.Node,
	diagnostic: ts.Diagnostic,
	cache: Set<ts.Node | ts.Symbol>,
) {
	const symbol = state.getOriginalSymbol(node);
	if (!(symbol ? cache.has(symbol) : cache.has(node))) {
		cache.add(symbol ?? node);
		DiagnosticService.addDiagnostic(diagnostic);
	}
}
