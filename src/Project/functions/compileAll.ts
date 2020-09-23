import ts from "byots";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getRootDirs } from "Project/functions/getRootDirs";
import { ProjectData, ProjectServices } from "Project/types";

export function compileAll(program: ts.BuilderProgram, data: ProjectData, services: ProjectServices) {
	copyInclude(data);
	copyFiles(program, services, new Set(getRootDirs(program.getCompilerOptions())));
	const emitResult = compileFiles(program, data, services, getChangedSourceFiles(program));
	program.getProgram().emitBuildInfo();
	return emitResult;
}
