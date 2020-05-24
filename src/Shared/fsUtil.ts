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

	return true;
}

/**
 * Cleanup a directory recursively
 * @param src
 * @param dest
 * @param shouldClean
 * @param dir
 */
export async function cleanupDirRecursively(
	translator: PathTranslator,
	src: string,
	dest: string,
	shouldClean: (translator: PathTranslator, itemPath: string) => Promise<boolean> = isOutputFileOrphaned,
	dir = dest,
) {
	if (await fs.pathExists(dir)) {
		for (const name of await fs.readdir(dir)) {
			const itemPath = path.join(dir, name);
			if ((await fs.stat(itemPath)).isDirectory()) {
				await cleanupDirRecursively(translator, src, dest, shouldClean, itemPath);
			}
			if (await shouldClean(translator, itemPath)) {
				await fs.remove(itemPath);
				console.log("remove", itemPath);
			}
		}
	}
}
