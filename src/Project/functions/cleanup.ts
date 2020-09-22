import fs from "fs-extra";
import { cleanupDirRecursively } from "Project/functions/cleanupDirRecursively";
import { PathTranslator } from "Shared/classes/PathTranslator";

export function cleanup(pathTranslator: PathTranslator) {
	const outDir = pathTranslator.outDir;
	if (fs.pathExistsSync(outDir)) {
		cleanupDirRecursively(pathTranslator, outDir);
	}
}
