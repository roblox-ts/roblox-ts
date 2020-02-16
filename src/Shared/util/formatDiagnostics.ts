import { EOL } from "os";
import ts from "typescript";

export function formatDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>) {
	return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCurrentDirectory: () => process.cwd(),
		getCanonicalFileName: fileName => fileName,
		getNewLine: () => EOL,
	});
}
