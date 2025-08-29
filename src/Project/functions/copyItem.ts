import { PathTranslator } from "@roblox-ts/path-translator";
import fs from "fs-extra";
import { ProjectData } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { DTS_EXT } from "Shared/constants";

export function copyItem(data: ProjectData, pathTranslator: PathTranslator, item: string) {
	try {
		fs.copySync(item, pathTranslator.getOutputPath(item), {
			filter: (src, dest) => {
				if (
					data.projectOptions.writeOnlyChanged &&
					fs.pathExistsSync(dest) &&
					!fs.lstatSync(src).isDirectory() &&
					fs.readFileSync(src).toString() === fs.readFileSync(dest).toString()
				) {
					return false;
				}

				if (src.endsWith(DTS_EXT)) {
					return pathTranslator.declaration;
				}

				return !isCompilableFile(src);
			},
			dereference: true,
		});
	} catch (e) {
		// Silently ignore file not found errors (race condition during rapid file changes)
		if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
			throw e;
		}
	}
}
