import { hasErrors } from "Shared/util/hasErrors";
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

	public static addDiagnosticWithCache<T>(cacheBy: T, diagnostic: ts.Diagnostic, cache: Set<T>) {
		if (!cache.has(cacheBy)) {
			cache.add(cacheBy);
			this.addDiagnostic(diagnostic);
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
