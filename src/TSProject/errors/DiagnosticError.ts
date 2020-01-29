import chalk from "chalk";
import { LoggableError } from "Shared/errors/LoggableError";
import { formatDiagnostics } from "TSProject/util/formatDiagnostics";
import ts from "typescript";

// force colors
chalk.level = 1;

export class DiagnosticError extends LoggableError {
	constructor(private diagnostics: Array<ts.Diagnostic>) {
		super();
	}

	public log() {
		console.log(chalk.redBright("Diagnostic Error:"));
		console.log(formatDiagnostics(this.diagnostics));
	}
}
