import ts from "byots";

export class DiagnosticService {
	private static diagnostics = new Array<ts.Diagnostic>();

	public static addDiagnostic(diagnostic: ts.Diagnostic) {
		this.diagnostics.push(diagnostic);
	}

	public static flush() {
		const current = this.diagnostics;
		this.diagnostics = [];
		return current;
	}
}
