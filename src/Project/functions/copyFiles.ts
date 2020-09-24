import fs from "fs-extra";
import { ProjectServices } from "Project/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import { isCompilableFile } from "Shared/util/isCompilableFile";

export function copyItem(services: ProjectServices, item: string) {
	fs.copySync(item, services.pathTranslator.getOutputPath(item), {
		filter: src => !isCompilableFile(src),
		dereference: true,
	});
}

export function copyFiles(services: ProjectServices, sources: Set<string>) {
	benchmarkIfVerbose("copy non-compiled files", () => {
		for (const source of sources) {
			copyItem(services, source);
		}
	});
}
