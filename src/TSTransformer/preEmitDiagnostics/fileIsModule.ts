import { errors } from "Shared/diagnostics";
import ts from "typescript";

export function fileIsModule(sourceFile: ts.SourceFile) {
	if (sourceFile.externalModuleIndicator === undefined) {
		return [errors.noNonModule(sourceFile.statements[0] ?? sourceFile)];
	}
	return [];
}
