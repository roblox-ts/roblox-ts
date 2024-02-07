import { fileUsesCommentDirectives } from "Project/preEmitDiagnostics/fileUsesCommentDirectives";
import { ProjectData } from "Shared/types";
import ts from "typescript";

export type PreEmitChecker = (data: ProjectData, sourceFile: ts.SourceFile) => Array<ts.Diagnostic>;
const PRE_EMIT_DIAGNOSTICS: Array<PreEmitChecker> = [fileUsesCommentDirectives];

export function getCustomPreEmitDiagnostics(data: ProjectData, sourceFile: ts.SourceFile) {
	const diagnostics = new Array<ts.Diagnostic>();
	for (const check of PRE_EMIT_DIAGNOSTICS) {
		diagnostics.push(...check(data, sourceFile));
	}
	return diagnostics;
}
