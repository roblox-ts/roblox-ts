import { PathTranslator } from "@roblox-ts/path-translator";
import { copyItem } from "Project/functions/copyItem";
import { ProjectData } from "Shared/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyFiles(data: ProjectData, pathTranslator: PathTranslator, sources: Set<string>) {
	benchmarkIfVerbose("copy non-compiled files", () => {
		for (const source of sources) {
			copyItem(data, pathTranslator, source);
		}
	});
}
