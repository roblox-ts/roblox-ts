import ts from "byots";

/**
 * CompileState is state that lives only for a single compilation step.
 */
export class CompileState {
	public readonly isMethodCache = new Map<ts.Symbol, boolean>();
	public readonly isDefinedAsLetCache = new Map<ts.Symbol, boolean>();
	public readonly getModuleExportsAliasMapCache = new Map<ts.Symbol, Map<ts.Symbol, string>>();

	constructor(public readonly pkgVersion: string | undefined) {}
}
