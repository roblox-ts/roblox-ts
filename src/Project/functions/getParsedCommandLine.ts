import ts from "byots";
import { ProjectData } from "Project";
import { validateCompilerOptions } from "Project/functions/validateCompilerOptions";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";

export function getParsedCommandLine(data: ProjectData) {
	const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(data.tsConfigPath, {}, createParseConfigFileHost());
	if (parsedCommandLine === undefined) {
		throw new ProjectError("Unable to load TS program!");
	} else if (parsedCommandLine.errors.length > 0) {
		throw new DiagnosticError(parsedCommandLine.errors);
	}
	validateCompilerOptions(parsedCommandLine.options, data.nodeModulesPath);
	return parsedCommandLine;
}
