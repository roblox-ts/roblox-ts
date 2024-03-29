import { EOL } from "os";
import ts from "typescript";

function createFormatDiagnosticsHost(): ts.FormatDiagnosticsHost {
	return {
		getCurrentDirectory: () => process.cwd(),
		getCanonicalFileName: fileName => fileName,
		getNewLine: () => EOL,
	};
}

/**
 * Formats a given array of typescript diagnostics, `diagnostics`, into a readable format.
 */
export function formatDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>) {
	return ts.formatDiagnosticsWithColorAndContext(diagnostics, createFormatDiagnosticsHost());
}
