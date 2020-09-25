import fs from "fs-extra";
import path from "path";
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

function cleanupDirRecursively(pathTranslator: PathTranslator, dir: string) {
	if (fs.pathExistsSync(dir)) {
		for (const name of fs.readdirSync(dir)) {
			const itemPath = path.join(dir, name);
			if (fs.statSync(itemPath).isDirectory()) {
				cleanupDirRecursively(pathTranslator, itemPath);
			}
			tryRemoveOutput(pathTranslator, itemPath);
		}
	}
}

export function cleanup(pathTranslator: PathTranslator) {
	const outDir = pathTranslator.outDir;
	if (fs.pathExistsSync(outDir)) {
		cleanupDirRecursively(pathTranslator, outDir);
	}
}
