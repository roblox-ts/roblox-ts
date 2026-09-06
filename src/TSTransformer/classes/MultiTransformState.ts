import type { BindingUsage } from "TSTransformer/util/evaluation/bindings";
import type { EvaluationEffects } from "TSTransformer/util/evaluation/effects";
import type { BindingKey } from "TSTransformer/util/evaluation/facts";
import ts from "typescript";

/**
 * MultiTransformState is state that lives only for a single compilation step.
 */
export class MultiTransformState {
	// type classifications stay valid for this compilation; emitted AST facts can still change
	public readonly isPrimitiveTypeCache = new Map<ts.Type, boolean>();
	public readonly isRobloxTypeCache = new Map<ts.Type, boolean>();
	public readonly functionEffects = new Map<ts.Symbol, EvaluationEffects>();
	public readonly bindingKeys = new Map<ts.Symbol, BindingKey>();
	public readonly bindingUsageBySourceFile = new Map<ts.SourceFile, BindingUsage>();
	public readonly isMethodCache = new Map<ts.Symbol, boolean>();
	public readonly isDefinedAsLetCache = new Map<ts.Symbol, boolean>();
	public readonly isAnyOrAnyArrayCache = new Map<ts.Type, boolean>();
	public readonly isReportedByNoAnyCache = new Set<ts.Symbol>();
	public readonly isReportedByMultipleDefinitionsCache = new Set<ts.Symbol>();
	public readonly getModuleExportsCache = new Map<ts.Symbol, Array<ts.Symbol>>();
	public readonly getModuleExportsAliasMapCache = new Map<ts.Symbol, Map<ts.Symbol, string>>();
}
