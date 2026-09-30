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
	inputFileNames: ReadonlyArray<string>,
	pathTranslator: PathTranslator,
) {
	if (data.rojoConfigPath !== undefined) {
		// inspect all inputs, including imports, independently of the files changed in this build
		const inputs = inputFileNames.filter(fileName =>
			rootDirs.some(rootDir => isPathDescendantOf(fileName, rootDir)),
		);
		for (const partition of rojoResolver.getPartitions()) {
			// only flag partitions that would sync compiler input
			if (inputs.some(fileName => isPathDescendantOf(fileName, partition.fsPath))) {
				const rojoConfigDir = path.dirname(data.rojoConfigPath);
				const outPath = pathTranslator.getOutputPath(partition.fsPath);

				const inputPath = path.relative(rojoConfigDir, partition.fsPath);
				const suggestedPath = path.relative(rojoConfigDir, outPath);
				DiagnosticService.addDiagnostic(errors.rojoPathInSrc(inputPath, suggestedPath));
			}
		}
	}
}
