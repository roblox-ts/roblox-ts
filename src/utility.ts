import * as path from "path";

const luaIdentifierRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function isValidLuaIdentifier(id: string) {
	return luaIdentifierRegex.test(id);
}

export function safeLuaIndex(parent: string, child: string) {
	if (isValidLuaIdentifier(child)) {
		return `${parent}.${child}`;
	} else {
		return `${parent}["${child}"]`;
	}
}

export function stripExts(fileName: string): string {
	const ext = path.extname(fileName);
	if (ext.length > 0) {
		return stripExts(path.basename(fileName, ext));
	} else {
		return fileName;
	}
}
