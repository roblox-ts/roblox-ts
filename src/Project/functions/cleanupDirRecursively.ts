import fs from "fs-extra";
import path from "path";
import { isOutputFileOrphaned } from "Project/functions/isOutputFileOrphaned";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";

export function cleanupDirRecursively(pathTranslator: PathTranslator, dir: string) {
	if (fs.pathExistsSync(dir)) {
		for (const name of fs.readdirSync(dir)) {
			const itemPath = path.join(dir, name);
			if (fs.statSync(itemPath).isDirectory()) {
				cleanupDirRecursively(pathTranslator, itemPath);
			}
			if (isOutputFileOrphaned(pathTranslator, itemPath)) {
				fs.removeSync(itemPath);
				LogService.writeLineIfVerbose(`remove ${itemPath}`);
			}
		}
	}
}
