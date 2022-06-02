import ts from "typescript";

/**
 * MultiTransformState is state that lives only for a single compilation step.
 */
export class MultiTransformState {
	public readonly isMethodCache = new Map<ts.Symbol, boolean>();
	public readonly isDefinedAsLetCache = new Map<ts.Symbol, boolean>();
	public readonly isReportedByNoAnyCache = new Set<ts.Symbol>();
	public readonly isReportedByMultipleDefinitionsCache = new Set<ts.Symbol>();
	public readonly getModuleExportsCache = new Map<ts.Symbol, Array<ts.Symbol>>();
	public readonly getModuleExportsAliasMapCache = new Map<ts.Symbol, Map<ts.Symbol, string>>();
}
