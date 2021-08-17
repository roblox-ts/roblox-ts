import ts from "byots";
import { fileIsModule } from "TSTransformer/preEmitDiagnostics/fileIsModule";

export type PreEmitChecker = (sourceFile: ts.SourceFile) => Array<ts.Diagnostic>;
const PRE_EMIT_DIAGNOSTICS: Array<PreEmitChecker> = [fileIsModule];

export function getCustomPreEmitDiagnostics(sourceFile: ts.SourceFile) {
	const diagnostics = new Array<ts.Diagnostic>();
	for (const check of PRE_EMIT_DIAGNOSTICS) {
		diagnostics.push(...check(sourceFile));
	}
	return diagnostics;
}
