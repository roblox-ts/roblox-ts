import { copyItem } from "Project/functions/copyItem";
import { ProjectData, ProjectServices } from "Project/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyFiles(data: ProjectData, services: ProjectServices, sources: Set<string>) {
	benchmarkIfVerbose("copy non-compiled files", () => {
		for (const source of sources) {
			copyItem(data, services, source);
		}
	});
}
