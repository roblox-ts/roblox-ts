import ts from "byots";
import { hasErrors } from "Shared/util/hasErrors";

export class DiagnosticService {
	private static diagnostics = new Array<ts.Diagnostic>();

	public static addDiagnostic(diagnostic: ts.Diagnostic) {
		this.diagnostics.push(diagnostic);
	}

	public static addDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>) {
		this.diagnostics.push(...diagnostics);
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
