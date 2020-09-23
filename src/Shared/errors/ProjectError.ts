import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";

export class ProjectError extends DiagnosticError {
	constructor(message: string) {
		super([createTextDiagnostic(message)]);
	}
}
