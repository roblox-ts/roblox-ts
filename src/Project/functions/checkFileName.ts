import path from "path";
import { FILENAME_WARNINGS } from "Shared/constants";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";

export function checkFileName(filePath: string) {
	const baseName = path.basename(filePath);
	const nameWarning = FILENAME_WARNINGS.get(baseName);
	if (nameWarning) {
		DiagnosticService.addDiagnostic(errors.incorrectFileName(baseName, nameWarning, filePath));
	}
}
