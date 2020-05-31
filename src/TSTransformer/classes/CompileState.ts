import ts from "byots";
import { fileIsModule } from "TSTransformer/preEmitDiagnostics/fileIsModule";

export type preEmitChecker = (sourceFile: ts.SourceFile) => Array<ts.Diagnostic>;
const preEmitDiagnostics: Array<preEmitChecker> = [fileIsModule];

/**
 * CompileState is state that lives only for a single compilation step.
 */
export class CompileState {
	public readonly isMethodCache = new Map<ts.Symbol, boolean>();
	public readonly isDefinedAsLetCache = new Map<ts.Symbol, boolean>();
	public readonly getModuleExportsCache = new Map<ts.Symbol, Array<ts.Symbol>>();
	public readonly getModuleExportsAliasMapCache = new Map<ts.Symbol, Map<ts.Symbol, string>>();

	constructor(public readonly pkgVersion: string | undefined) {}

	getCustomPreEmitDiagnostics(sourceFile: ts.SourceFile) {
		const diagnostics: Array<ts.Diagnostic> = [];
		preEmitDiagnostics.forEach(check => diagnostics.push(...check(sourceFile)));
		return diagnostics;
	}
}
