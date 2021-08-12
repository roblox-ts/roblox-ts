import path from "path";
import { FILENAME_WARNINGS } from "Shared/constants";
import { warnings } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";

export function checkFilename(filePath: string) {
	const baseName = path.basename(filePath);
	const nameWarning = FILENAME_WARNINGS.get(baseName);
	if (nameWarning) {
		DiagnosticService.addDiagnostic(warnings.incorrectRootFilename(baseName, nameWarning, filePath));
	}
}
