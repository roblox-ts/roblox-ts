import fs from "fs-extra";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";

function isOutputFileOrphaned(pathTranslator: PathTranslator, filePath: string) {
	for (const path of pathTranslator.getInputPaths(filePath)) {
		if (fs.pathExistsSync(path)) {
			return false;
		}
	}

	if (pathTranslator.buildInfoOutputPath === filePath) {
		return false;
	}

	return true;
}

export function tryRemoveOutput(pathTranslator: PathTranslator, outPath: string) {
	if (isOutputFileOrphaned(pathTranslator, outPath)) {
		fs.removeSync(outPath);
		LogService.writeLineIfVerbose(`remove ${outPath}`);
	}
}
