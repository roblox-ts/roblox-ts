import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";

function isOutputFileOrphaned(pathTranslator: PathTranslator, filePath: string) {
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

export function tryRemove(pathTranslator: PathTranslator, itemPath: string) {
	if (isOutputFileOrphaned(pathTranslator, itemPath)) {
		fs.removeSync(itemPath);
		LogService.writeLineIfVerbose(`remove ${itemPath}`);
	}
}

function cleanupDirRecursively(pathTranslator: PathTranslator, dir: string) {
	if (fs.pathExistsSync(dir)) {
		for (const name of fs.readdirSync(dir)) {
			const itemPath = path.join(dir, name);
			if (fs.statSync(itemPath).isDirectory()) {
				cleanupDirRecursively(pathTranslator, itemPath);
			}
			tryRemove(pathTranslator, itemPath);
		}
	}
}

export function cleanup(pathTranslator: PathTranslator) {
	const outDir = pathTranslator.outDir;
	if (fs.pathExistsSync(outDir)) {
		cleanupDirRecursively(pathTranslator, outDir);
	}
}
