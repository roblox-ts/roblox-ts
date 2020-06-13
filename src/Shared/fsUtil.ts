import fs from "fs-extra";
import path from "path";
import { PathTranslator } from "Shared/PathTranslator";

/**
 * Checks if the `filePath` path is a descendant of the `dirPath` path.
 * @param filePath A path to a file.
 * @param dirPath A path to a directory.
 */
export function isPathDescendantOf(filePath: string, dirPath: string) {
	return dirPath === filePath || !path.relative(dirPath, filePath).startsWith("..");
}

export function isOutputFileOrphaned(translator: PathTranslator, filePath: string) {
	const inputPaths = translator.getInputPaths(filePath);
	for (const path of inputPaths) {
		if (fs.pathExistsSync(path)) {
			return false;
		}
	}

	if (translator.buildInfoOutputPath === filePath) {
		return false;
	}

	return true;
}

/**
 * Cleanup a directory recursively
 */
export function cleanupDirRecursively(translator: PathTranslator, dir = translator.outDir) {
	if (fs.pathExistsSync(dir)) {
		for (const name of fs.readdirSync(dir)) {
			const itemPath = path.join(dir, name);
			if (fs.statSync(itemPath).isDirectory()) {
				cleanupDirRecursively(translator, itemPath);
			}
			if (isOutputFileOrphaned(translator, itemPath)) {
				fs.removeSync(itemPath);
				console.log("remove", itemPath);
			}
		}
	}
}
