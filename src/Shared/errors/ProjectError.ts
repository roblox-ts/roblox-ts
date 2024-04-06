import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { createTextDiagnostic } from "Shared/util/createDiagnostic";
import ts from "typescript";

export class ProjectError extends DiagnosticError {
	constructor(message: string) {
		// TODO: Change id to something better
		// Maybe separate ProjectErrors into dedicated diagnostic factories too?
		super([createTextDiagnostic(ts.DiagnosticCategory.Error, 999, message)]);
	}
}
