import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";

/**
 * Checks if the `filePath` path is a descendant of the `dirPath` path.
 * @param filePath A path to a file.
 * @param dirPath A path to a directory.
 */
export function isPathDescendantOf(filePath: string, dirPath: string) {
	return dirPath === filePath || !path.relative(dirPath, filePath).startsWith("..");
}
