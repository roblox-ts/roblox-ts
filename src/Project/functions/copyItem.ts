import { PathTranslator } from "@roblox-ts/path-translator";
import fs from "fs-extra";
import { ProjectData } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { DTS_EXT } from "Shared/constants";

export function copyItem(data: ProjectData, pathTranslator: PathTranslator, item: string) {
	// Check if source file/directory exists before attempting to copy
	if (!fs.pathExistsSync(item)) {
		return;
	}

	fs.copySync(item, pathTranslator.getOutputPath(item), {
		filter: (src, dest) => {
			// Check if source file exists before performing any operations
			if (!fs.pathExistsSync(src)) {
				return false;
			}

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
}
