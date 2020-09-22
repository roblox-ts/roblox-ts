import fs from "fs-extra";
import { PathTranslator } from "Shared/classes/PathTranslator";

export function isOutputFileOrphaned(pathTranslator: PathTranslator, filePath: string) {
	const inputPaths = pathTranslator.getInputPaths(filePath);
	for (const path of inputPaths) {
		if (fs.pathExistsSync(path)) {
			return false;
		}
	}

	if (pathTranslator.buildInfoOutputPath === filePath) {
		return false;
	}

	return true;
}
