import ts from "typescript";
import { EOL } from "os";

export function formatDiagnostics(diagnostics: Array<ts.Diagnostic>) {
	return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCurrentDirectory: () => process.cwd(),
		getCanonicalFileName: fileName => fileName,
		getNewLine: () => EOL,
	});
}
