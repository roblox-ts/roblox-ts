import path from "path";
import fs from "fs-extra";
import { PathTranslator } from "Shared/PathTranslator";

/**
 * Checks if the `filePath` path is a descendant of the `dirPath` path.
 * @param filePath A path to a file.
 * @param dirPath A path to a directory.
 */
export function isPathDescendantOf(filePath: string, dirPath: string) {
	return dirPath === filePath || !path.relative(dirPath, filePath).startsWith("..");
}

export async function isOutputFileOrphaned(translator: PathTranslator, filePath: string) {
	const inputPaths = translator.getInputPaths(filePath);
	for (const path of inputPaths) {
		if (await fs.pathExists(path)) {
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
export async function cleanupDirRecursively(translator: PathTranslator, dir = translator.outDir) {
	if (await fs.pathExists(dir)) {
		for (const name of await fs.readdir(dir)) {
			const itemPath = path.join(dir, name);
			if ((await fs.stat(itemPath)).isDirectory()) {
				await cleanupDirRecursively(translator, itemPath);
			}
			if (await isOutputFileOrphaned(translator, itemPath)) {
				await fs.remove(itemPath);
				console.log("remove", itemPath);
			}
		}
	}
}
