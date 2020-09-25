import fs from "fs-extra";
import path from "path";
import { tryRemoveOutput } from "Project/functions/tryRemoveOutput";
import { PathTranslator } from "Shared/classes/PathTranslator";

function cleanupDirRecursively(pathTranslator: PathTranslator, dir: string) {
	if (fs.pathExistsSync(dir)) {
		for (const name of fs.readdirSync(dir)) {
			const itemPath = path.join(dir, name);
			if (fs.statSync(itemPath).isDirectory()) {
				cleanupDirRecursively(pathTranslator, itemPath);
			}
			tryRemoveOutput(pathTranslator, itemPath);
		}
	}
}

export function cleanup(pathTranslator: PathTranslator) {
	const outDir = pathTranslator.outDir;
	if (fs.pathExistsSync(outDir)) {
		cleanupDirRecursively(pathTranslator, outDir);
	}
}
