import fs from "fs-extra";
import { ProjectData } from "Project";
import { createReadBuildProgramHost } from "Project/util/createReadBuildProgramHost";
import { COMPILER_VERSION } from "Shared/constants";
import { assert } from "Shared/util/assert";
import ts from "typescript";

function createCompilerHost(data: ProjectData, compilerOptions: ts.CompilerOptions) {
	const host = ts.createIncrementalCompilerHost(compilerOptions);

	let contentsToHash = "";
	contentsToHash += `version=${COMPILER_VERSION},`;
	contentsToHash += `type=${String(data.projectOptions.type)},`;
	contentsToHash += `isPackage=${String(data.isPackage)},`;
	contentsToHash += `plugins=${JSON.stringify(compilerOptions.plugins ?? [])},`;

	if (data.rojoConfigPath && fs.existsSync(data.rojoConfigPath)) {
		contentsToHash += fs.readFileSync(data.rojoConfigPath).toString();
	}

	assert(host.createHash);
	const origCreateHash = host.createHash;
	host.createHash = (data: string) => origCreateHash(contentsToHash + data);

	return host;
}

export function createProgramFactory(
	data: ProjectData,
	options: ts.CompilerOptions,
): ts.CreateProgram<ts.EmitAndSemanticDiagnosticsBuilderProgram> {
	return (
		rootNames: ReadonlyArray<string> | undefined,
		compilerOptions: ts.CompilerOptions | undefined = options,
		host = createCompilerHost(data, options),
		oldProgram = ts.readBuilderProgram(options, createReadBuildProgramHost()),
	) => ts.createEmitAndSemanticDiagnosticsBuilderProgram(rootNames, compilerOptions, host, oldProgram);
}
