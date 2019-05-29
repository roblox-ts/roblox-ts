import path from "path";

export function transformPathToLua(rootPath: string, outPath: string, filePath: string) {
	const relativeToRoot = path.dirname(path.relative(rootPath, filePath));
	let name = path.basename(filePath, path.extname(filePath));
	const exts = new Array<string>();
	while (true) {
		const ext = path.extname(name);
		if (ext.length > 0) {
			exts.unshift(ext);
			name = path.basename(name, ext);
		} else {
			break;
		}
	}
	if (exts[exts.length - 1] === ".d") {
		exts.pop();
	}
	if (name === "index") {
		name = "init";
	}
	const luaName = name + exts.join("") + ".lua";
	return path.join(outPath, relativeToRoot, luaName);
}
