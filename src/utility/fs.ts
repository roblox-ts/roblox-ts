import fs from "fs-extra";
import path from "path";
import { LUA_EXT } from "../constants";

export async function shouldCleanRelative(src: string, dest: string, itemPath: string) {
	return !(await fs.pathExists(path.join(src, path.relative(dest, itemPath))));
}

export async function cleanDirRecursive(
	src: string,
	dest: string,
	shouldClean: (src: string, dest: string, itemPath: string) => Promise<boolean> = shouldCleanRelative,
	dir = dest,
) {
	if (await fs.pathExists(dir)) {
		for (const name of await fs.readdir(dir)) {
			const itemPath = path.join(dir, name);
			if ((await fs.stat(itemPath)).isDirectory()) {
				await cleanDirRecursive(src, dest, shouldClean, itemPath);
			}
			if (await shouldClean(src, dest, itemPath)) {
				await fs.remove(itemPath);
				console.log("remove", itemPath);
			}
		}
	}
}

export async function copyLuaFiles(
	src: string,
	dest: string,
	shouldClean: (src: string, dest: string, itemPath: string) => Promise<boolean> = shouldCleanRelative,
) {
	await cleanDirRecursive(src, dest, shouldClean);

	const foldersContainingLua = new Set<string>();

	async function checkContainsLua(dir: string): Promise<boolean> {
		for (const item of await fs.readdir(dir)) {
			const itemPath = path.join(dir, item);
			if ((await fs.stat(itemPath)).isDirectory()) {
				if (await checkContainsLua(itemPath)) {
					foldersContainingLua.add(dir);
				}
			} else if (itemPath.endsWith(LUA_EXT)) {
				foldersContainingLua.add(dir);
			}
		}
		return foldersContainingLua.has(dir);
	}

	await checkContainsLua(src);

	await fs.copy(src, dest, {
		recursive: true,
		overwrite: true,
		filter: src => foldersContainingLua.has(src) || path.extname(src) === LUA_EXT,
	});
}
