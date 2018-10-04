import * as path from "path";

export function stripExts(fileName: string): string {
	const ext = path.extname(fileName);
	if (ext.length > 0) {
		return stripExts(path.basename(fileName, ext));
	} else {
		return fileName;
	}
}
