import * as ts from "ts-simple-ast";

export class DiagnosticError extends Error {
	constructor(public readonly diagnostics: Array<ts.Diagnostic>) {
		super();
	}
}
