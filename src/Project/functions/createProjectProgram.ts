import { createProgramFactory } from "Project/functions/createProgramFactory";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { ProjectData } from "Shared/types";
import ts from "typescript";

export function createProjectProgram(data: ProjectData, host?: ts.CompilerHost) {
	const { fileNames, options, projectReferences } = getParsedCommandLine(data);
	const createProgram = createProgramFactory(data, options, projectReferences);
	return createProgram(fileNames, options, host);
}
