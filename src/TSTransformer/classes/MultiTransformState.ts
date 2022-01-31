import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

/**
 * MultiTransformState is state that lives only for a single compilation step.
 */
export class MultiTransformState {
	public readonly isMethodCache = new Map<ts.Symbol, boolean>();
	public readonly isDefinedAsLetCache = new Map<ts.Symbol, boolean>();
	public readonly isReportedByNoAnyCache = new Set<ts.Symbol | ts.Node>();
	public readonly isReportedByMultipleDefinitionsCache = new Set<ts.Symbol | ts.Node>();
	public readonly getModuleExportsCache = new Map<ts.Symbol, Array<ts.Symbol>>();
	public readonly getModuleExportsAliasMapCache = new Map<ts.Symbol, Map<ts.Symbol, string>>();

	public hasCheckedJsxFactory = false;
	public checkJsxFactory(node: ts.Node, compilerOptions: ts.CompilerOptions) {
		this.hasCheckedJsxFactory = true;
		if (!this.hasCheckedJsxFactory && compilerOptions.jsxFactory !== "Roact.createElement") {
			DiagnosticService.addDiagnostic(errors.invalidJsxFactory(node));
		}
	}
	public hasCheckedJsxFragmentFactory = false;
	public checkJsxFragmentFactory(node: ts.Node, compilerOptions: ts.CompilerOptions) {
		this.hasCheckedJsxFragmentFactory = true;
		if (!this.hasCheckedJsxFragmentFactory && compilerOptions.jsxFragmentFactory !== "Roact.createFragment") {
			DiagnosticService.addDiagnostic(errors.invalidJsxFragmentFactory(node));
		}
	}

	constructor() {}
}
