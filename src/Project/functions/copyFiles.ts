import { copyItem } from "Project/functions/copyItem";
import { ProjectServices } from "Project/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyFiles(services: ProjectServices, sources: Set<string>) {
	benchmarkIfVerbose("copy non-compiled files", () => {
		for (const source of sources) {
			copyItem(services, source);
		}
	});
}
