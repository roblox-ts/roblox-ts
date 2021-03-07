import fs from "fs-extra";

export function realPathExistsSync(fsPath: string) {
	if (fs.pathExistsSync(fsPath)) {
		return fs.realpathSync(fsPath);
	}
}
