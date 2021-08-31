import fs from "fs-extra";
import { ProjectData } from "Project";
import { createReadBuildProgramHost } from "Project/util/createReadBuildProgramHost";
import { COMPILER_VERSION } from "Shared/constants";
import { assert } from "Shared/util/assert";
import ts from "typescript";

function createCompilerHost(data: ProjectData, compilerOptions: ts.CompilerOptions) {
	const host = ts.createIncrementalCompilerHost(compilerOptions);

	let contentsToHash = "";

	contentsToHash += data.pkgVersion;

	if (data.rojoConfigPath && fs.existsSync(data.rojoConfigPath)) {
		contentsToHash += fs.readFileSync(data.rojoConfigPath).toString();
	}

	// super hack!
	// we set `ts.version` so that new versions of roblox-ts trigger full re-compile for incremental mode
	// rojoHash makes it so that changes to the rojo config will trigger full re-compile

	assert(host.createHash);

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	ts.version = `${COMPILER_VERSION}-${host.createHash(contentsToHash)}`;

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
