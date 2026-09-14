import path from "path";

/**
 * Checks if the `filePath` path is a descendant of the `dirPath` path.
 * @param filePath A path to a file.
 * @param dirPath A path to a directory.
 */
export function isPathDescendantOf(filePath: string, dirPath: string) {
	const relativePath = path.relative(dirPath, filePath);

	// paths on different Windows drives have no relative path, so path.relative returns an absolute path
	if (path.isAbsolute(relativePath)) {
		return false;
	}

	// exclude the parent directory (..) and paths that traverse through it
	return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`);
}
