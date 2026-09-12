import { CLIError } from "CLI/errors/CLIError";
import { findTsConfigPath } from "CLI/util/findTsConfigPath";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProgramFactory } from "Project/functions/createProgramFactory";
import { createProjectData } from "Project/functions/createProjectData";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { parseProjectConfig } from "Project/functions/parseProjectConfig";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";
import { ProjectOptions } from "Shared/types";

export function createRojoProject(argv: { project: string; rojo?: string }) {
	const tsConfigPath = findTsConfigPath(argv.project);
	const config = parseProjectConfig(tsConfigPath);
	const projectOptions: ProjectOptions = { ...DEFAULT_PROJECT_OPTIONS, ...config.raw.rbxts };
	if (argv.rojo !== undefined) {
		projectOptions.rojo = argv.rojo;
	}

	const data = createProjectData(tsConfigPath, projectOptions);
	const rojoConfigPath = data.rojoConfigPath;
	if (rojoConfigPath === undefined) {
		throw new CLIError("Unable to find a Rojo project file! Use --rojo to select one.");
	}

	const { fileNames, options, projectReferences } = getParsedCommandLine(data, config);
	const program = createProgramFactory(data, options, projectReferences)(fileNames, options);
	return { rojoConfigPath, pathTranslator: createPathTranslator(program, data) };
}
