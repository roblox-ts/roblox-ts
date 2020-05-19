import ts from "byots";
import { EOL } from "os";

/**
 * Formats a given array of typescript diagnostics, `diagnostics`, into a readable format.
 */
export function formatDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>) {
	return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCurrentDirectory: () => process.cwd(),
		getCanonicalFileName: fileName => fileName,
		getNewLine: () => EOL,
	});
}
