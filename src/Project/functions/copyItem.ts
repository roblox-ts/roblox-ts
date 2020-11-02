import fs from "fs-extra";
import { ProjectData, ProjectServices } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";

export function copyItem(data: ProjectData, services: ProjectServices, item: string) {
	fs.copySync(item, services.pathTranslator.getOutputPath(item), {
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
