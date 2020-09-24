import fs from "fs-extra";
import path from "path";

export function walkDirectorySync(dir: string, callback: (fsPath: string) => void) {
	const queue = [dir];
	for (let i = 0; i < queue.length; i++) {
		const currentDir = queue[i];
		for (const child of fs.readdirSync(currentDir)) {
			const fsPath = path.join(currentDir, child);
			callback(fsPath);
			if (fs.statSync(fsPath).isDirectory()) {
				queue.push(fsPath);
			}
		}
	}
}
