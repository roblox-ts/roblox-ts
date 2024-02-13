import { PathTranslator } from "@roblox-ts/path-translator";
import { RojoResolver } from "@roblox-ts/rojo-resolver";
import path from "path";
import { ProjectData } from "Project";
import { errors } from "Shared/diagnostics";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";

export function checkRojoConfig(
	data: ProjectData,
	rojoResolver: RojoResolver,
	rootDirs: ReadonlyArray<string>,
	pathTranslator: PathTranslator,
) {
	if (data.rojoConfigPath !== undefined) {
		for (const partition of rojoResolver.getPartitions()) {
			for (const rootDir of rootDirs) {
				if (isPathDescendantOf(partition.fsPath, rootDir)) {
					const rojoConfigDir = path.dirname(data.rojoConfigPath);
					const outPath = pathTranslator.getOutputPath(partition.fsPath);

					const inputPath = path.relative(rojoConfigDir, partition.fsPath);
					const suggestedPath = path.relative(rojoConfigDir, outPath);
					DiagnosticService.addDiagnostic(errors.rojoPathInSrc(inputPath, suggestedPath));
				}
			}
		}
	}
}
