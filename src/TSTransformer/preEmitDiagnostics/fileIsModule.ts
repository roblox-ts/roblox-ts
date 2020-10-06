import ts from "byots";
import { errors } from "Shared/diagnostics";

export function fileIsModule(sourceFile: ts.SourceFile) {
	if (sourceFile.externalModuleIndicator === undefined) {
		return [errors.noNonModule(sourceFile.statements[0] ?? sourceFile)];
	}
	return [];
}
