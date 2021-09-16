import { LoggableError } from "Shared/errors/LoggableError";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";
import ts from "typescript";

export class DiagnosticError extends LoggableError {
	constructor(public readonly diagnostics: ReadonlyArray<ts.Diagnostic>) {
		super();
	}

	public toString() {
		return formatDiagnostics(this.diagnostics);
	}
}
