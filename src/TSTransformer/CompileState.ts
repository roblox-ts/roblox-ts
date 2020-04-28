import ts from "typescript";

/**
 * CompileState is state that lives only for a single compilation step.
 */
export class CompileState {
	public readonly isMethodCallCache = new Map<ts.Symbol, boolean>();
}
