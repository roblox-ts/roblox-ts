import ts from "byots";
import { diagnostics } from "Shared/diagnostics";

export function fileIsModule(sourceFile: ts.SourceFile) {
	if (
		!sourceFile.statements.some(
			node =>
				// TODO make list complete
				// missing all cases of `export const ...`
				// but catches all cases of `export {}` and `import {}`
				ts.isExportDeclaration(node) ||
				ts.isExportAssignment(node) ||
				ts.isImportCall(node) ||
				ts.isImportDeclaration(node),
		)
	) {
		return [diagnostics.missingImportOrExport(sourceFile.statements[0])];
	}
	return [];
}
