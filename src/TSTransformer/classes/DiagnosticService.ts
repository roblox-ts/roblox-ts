import { hasErrors } from "Shared/util/hasErrors";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export class DiagnosticService {
	private static diagnostics = new Array<ts.Diagnostic>();

	public static addDiagnostic(diagnostic: ts.Diagnostic) {
		this.diagnostics.push(diagnostic);
	}

	public static addDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>) {
		this.diagnostics.push(...diagnostics);
	}

	public static addDiagnosticFromNodeIfNotCached(
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

	public static flush() {
		const current = this.diagnostics;
		this.diagnostics = [];
		return current;
	}

	public static hasErrors() {
		return hasErrors(this.diagnostics);
	}
}
