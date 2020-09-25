import fs from "fs-extra";
import { ProjectServices } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";

export function copyItem(services: ProjectServices, item: string) {
	fs.copySync(item, services.pathTranslator.getOutputPath(item), {
		filter: src => !isCompilableFile(src),
		dereference: true,
	});
}
