export class DiagnosticError extends Error {
	constructor(public readonly errors: Array<string>) {
		super();
	}
}
