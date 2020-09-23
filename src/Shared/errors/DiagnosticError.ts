import ts from "byots";
import { LoggableError } from "Shared/errors/LoggableError";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

export class DiagnosticError extends LoggableError {
	constructor(public readonly diagnostics: ReadonlyArray<ts.Diagnostic>) {
		super();
	}

	public toString() {
		return formatDiagnostics(this.diagnostics).replace(/TS roblox\-ts/g, "roblox-ts");
	}
}
