import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";

export class CLIError extends DiagnosticError {
	constructor(message: string) {
		super([createTextDiagnostic(message)]);
	}
}
