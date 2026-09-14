import path from "path";

export function findAncestorDir(dirs: Array<string>) {
	dirs = dirs.map(path.normalize).map(v => (v.endsWith(path.sep) ? v : v + path.sep));
	let currentDir = dirs[0];
	while (!dirs.every(v => v.startsWith(currentDir))) {
		// keep a directory boundary so src-extra cannot match src
		currentDir = path.join(currentDir, "..", path.sep);
	}
	return currentDir;
}
