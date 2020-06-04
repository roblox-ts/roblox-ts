import ts from "byots";
import { diagnostics } from "Shared/diagnostics";

export function fileIsModule(sourceFile: ts.SourceFile) {
	if (sourceFile.externalModuleIndicator === undefined) {
		return [diagnostics.missingImportOrExport(sourceFile.statements[0])];
	}
	return [];
}
