import ts from "byots";
import { diagnostics } from "Shared/diagnostics";

export function fileIsModule(sourceFile: ts.SourceFile) {
	if (sourceFile.externalModuleIndicator === undefined) {
		return [diagnostics.noNonModule(sourceFile.statements[0] ?? sourceFile)];
	}
	return [];
}
