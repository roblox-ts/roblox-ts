import fs from "fs-extra";
import { ProjectData } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { PathTranslator } from "Shared/classes/PathTranslator";

export function copyItem(data: ProjectData, pathTranslator: PathTranslator, item: string) {
	fs.copySync(item, pathTranslator.getOutputPath(item), {
		filter: (src, dest) => {
			if (
				data.writeOnlyChanged &&
				fs.pathExistsSync(dest) &&
				!fs.lstatSync(src).isDirectory() &&
				fs.readFileSync(src).toString() === fs.readFileSync(dest).toString()
			) {
				return false;
			}
			return !isCompilableFile(src);
		},
		dereference: true,
	});
}
