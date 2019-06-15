export class DiagnosticError extends Error {
	constructor(public readonly errors: Array<string>) {
		super();
	}

	public toString() {
		return this.errors.join("\n");
	}
}
