import ts from "byots";
import path from "path";
import { FILENAME_WARNINGS } from "Shared/constants";
import { warnings } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";

function checkFilename(filePath: string) {
	const baseName = path.basename(filePath);
	const nameWarning = FILENAME_WARNINGS.get(baseName);
	if (nameWarning) {
		return warnings.incorrectRootFilename(baseName, nameWarning, filePath);
	}
}

export function checkSourceFileFilename(sourceFile: ts.SourceFile) {
	const nameWarning = checkFilename(sourceFile.fileName);
	if (nameWarning) {
		return [nameWarning];
	}
	return [];
}

export function checkDeclarationFileFilename(fileName: string) {
	const nameWarning = checkFilename(fileName);
	if (nameWarning) {
		DiagnosticService.addDiagnostic(nameWarning);
	}
}
