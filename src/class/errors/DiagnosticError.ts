export class DiagnosticError extends Error {
	constructor(public readonly amount: number) {
		super();
	}
}
