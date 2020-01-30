import { EOL } from "os";
import { DiagnosticError } from "TSProject/errors/DiagnosticError";
import ts from "typescript";

export function formatDiagnostics(diagnostics: Array<ts.Diagnostic>) {
	return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCurrentDirectory: () => process.cwd(),
		getCanonicalFileName: fileName => fileName,
		getNewLine: () => EOL,
	});
}

export function createParseConfigFileHost(): ts.ParseConfigFileHost {
	return {
		fileExists: ts.sys.fileExists,
		getCurrentDirectory: ts.sys.getCurrentDirectory,
		onUnRecoverableConfigFileDiagnostic: d => {
			throw new DiagnosticError([d]);
		},
		readDirectory: ts.sys.readDirectory,
		readFile: ts.sys.readFile,
		useCaseSensitiveFileNames: true,
	};
}
