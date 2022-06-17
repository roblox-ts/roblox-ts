import { RojoResolver } from "@roblox-ts/rojo-resolver";
import { ProjectData } from "Shared/types";
import ts from "typescript";

export function createRojoResolver(data: ProjectData, compilerOptions: ts.CompilerOptions) {
	return data.rojoConfigPath
		? RojoResolver.fromPath(data.rojoConfigPath)
		: RojoResolver.synthetic(compilerOptions.outDir!);
}
