import inspector from "inspector";
import path from "path";
import { ProjectData } from "Project";
import { parseProjectConfig } from "Project/functions/parseProjectConfig";
import { validateCompilerOptions } from "Project/functions/validateCompilerOptions";

export function getParsedCommandLine(data: ProjectData, parsedCommandLine = parseProjectConfig(data.tsConfigPath)) {
	if (parsedCommandLine.options.composite && !parsedCommandLine.options.rootDir) {
		// composite projects default to the config directory, rather than the common source directory
		parsedCommandLine.options.rootDir = path.dirname(data.tsConfigPath);
	}

	if ((globalThis as unknown as { RBXTSC_DEV: boolean }).RBXTSC_DEV || inspector.url() !== undefined) {
		if (!parsedCommandLine.options.composite) {
			parsedCommandLine.options.incremental = false;
			parsedCommandLine.options.tsBuildInfoFile = undefined;
		}
	}

	validateCompilerOptions(parsedCommandLine.options, data.projectPath);
	return parsedCommandLine;
}
