import { createProgramFactory } from "Project/functions/createProgramFactory";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { ProjectData } from "Shared/types";
import ts from "typescript";

export function createProjectProgram(data: ProjectData, host?: ts.CompilerHost) {
	const { fileNames, options } = getParsedCommandLine(data);
	const createProgram = createProgramFactory(data, options);
	return createProgram(fileNames, options, host);
}
