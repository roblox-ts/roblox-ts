import { hasErrors } from "Shared/util/hasErrors";
import { TransformState } from "TSTransformer";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts from "typescript";

export class DiagnosticService {
	private static diagnostics = new Array<ts.Diagnostic>();

	private static singleDiagnostics = new Set<number>();
	public static addSingleDiagnostic(diagnostic: ts.Diagnostic) {
		if (!this.singleDiagnostics.has(diagnostic.code)) {
			this.singleDiagnostics.add(diagnostic.code);
			this.addDiagnostic(diagnostic);
		}
	}

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
		const symbol = getOriginalSymbolOfNode(state.typeChecker, node);
		if (!(symbol ? cache.has(symbol) : cache.has(node))) {
			cache.add(symbol ?? node);
			DiagnosticService.addDiagnostic(diagnostic);
		}
	}

	public static flush() {
		const current = this.diagnostics;
		this.diagnostics = [];
		this.singleDiagnostics.clear();
		return current;
	}

	public static hasErrors() {
		return hasErrors(this.diagnostics);
	}
}
