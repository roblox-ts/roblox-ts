import ts from "byots";
import { ProjectData } from "Project";
import { validateCompilerOptions } from "Project/functions/validateCompilerOptions";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";

function createParseConfigFileHost(): ts.ParseConfigFileHost {
	return {
		fileExists: ts.sys.fileExists,
		getCurrentDirectory: ts.sys.getCurrentDirectory,
		onUnRecoverableConfigFileDiagnostic: d => {
			throw new DiagnosticError([d]);
		},
		readDirectory: ts.sys.readDirectory,
		readFile: ts.sys.readFile,
		useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
	};
}

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
