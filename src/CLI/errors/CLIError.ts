import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { createTextDiagnostic } from "Shared/util/createDiagnostic";
import ts from "typescript";

export class CLIError extends DiagnosticError {
	constructor(message: string) {
		super(
			// TODO: Change code to something better
			// Maybe separate CLIErrors into dedicated diagnostic factories too?
			[createTextDiagnostic(ts.DiagnosticCategory.Error, 999, message)],
		);
	}
}
