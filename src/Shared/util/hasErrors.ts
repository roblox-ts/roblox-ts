import ts from "typescript";

export function hasErrors(diagnostics: ReadonlyArray<ts.Diagnostic>) {
	return diagnostics.some(d => d.category === ts.DiagnosticCategory.Error);
}
