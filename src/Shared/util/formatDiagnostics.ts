import ts from "byots";
import { EOL } from "os";

export function formatDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>) {
	return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCurrentDirectory: () => process.cwd(),
		getCanonicalFileName: fileName => fileName,
		getNewLine: () => EOL,
	});
}
