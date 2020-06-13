import ts from "byots";
import chalk from "chalk";
import { LoggableError } from "Shared/errors/LoggableError";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

// force colors
chalk.level = chalk.Level.Basic;

export class DiagnosticError extends LoggableError {
	constructor(private diagnostics: Array<ts.Diagnostic>) {
		super();
	}

	public toString() {
		return formatDiagnostics(this.diagnostics).replace(/TS roblox\-ts/g, "roblox-ts");
	}
}
