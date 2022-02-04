import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

/**
 * MultiTransformState is state that lives only for a single compilation step.
 */
export class MultiTransformState {
	public readonly isMethodCache = new Map<ts.Symbol, boolean>();
	public readonly isDefinedAsLetCache = new Map<ts.Symbol, boolean>();
	public readonly isReportedByNoAnyCache = new Set<ts.Symbol>();
	public readonly getModuleExportsCache = new Map<ts.Symbol, Array<ts.Symbol>>();
	public readonly getModuleExportsAliasMapCache = new Map<ts.Symbol, Map<ts.Symbol, string>>();

	public hasCheckedJsxFactory = false;
	public isRoactJsxFactory(node: ts.Node, compilerOptions: ts.CompilerOptions) {
		const shouldTryToCompile = compilerOptions.jsxFactory === "Roact.createElement";
		if (!this.hasCheckedJsxFactory) {
			this.hasCheckedJsxFactory = true;
			if (!shouldTryToCompile) {
				DiagnosticService.addDiagnostic(errors.invalidJsxFactory(node));
			}
		}
		return shouldTryToCompile;
	}
	public hasCheckedJsxFragmentFactory = false;
	public isRoactJsxFragmentFactory(node: ts.Node, compilerOptions: ts.CompilerOptions) {
		const shouldTryToCompile = compilerOptions.jsxFragmentFactory === "Roact.createFragment";
		if (!this.hasCheckedJsxFragmentFactory) {
			this.hasCheckedJsxFragmentFactory = true;
			if (!shouldTryToCompile) {
				DiagnosticService.addDiagnostic(errors.invalidJsxFragmentFactory(node));
			}
		}
		return shouldTryToCompile;
	}

	constructor() {}
}
