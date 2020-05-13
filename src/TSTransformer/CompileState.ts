import ts from "byots";

/**
 * CompileState is state that lives only for a single compilation step.
 */
export class CompileState {
	public readonly isMethodCache = new Map<ts.Symbol, boolean>();
	public readonly isDefinedAsLetCache = new Map<ts.Symbol, boolean>();

	constructor(public readonly pkgVersion: string | undefined) {}
}
