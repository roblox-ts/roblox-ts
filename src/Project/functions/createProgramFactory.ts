import ts from "byots";
import fs from "fs-extra";
import { ProjectData } from "Project";
import { createReadBuildProgramHost } from "Project/util/createReadBuildProgramHost";
import { COMPILER_VERSION } from "Shared/constants";
import { assert } from "Shared/util/assert";

function createCompilerHost(data: ProjectData, compilerOptions: ts.CompilerOptions) {
	const host = ts.createIncrementalCompilerHost(compilerOptions);

	let rojoHash = "";
	if (data.rojoConfigPath) {
		assert(host.createHash);
		rojoHash = "-" + host.createHash(fs.readFileSync(data.rojoConfigPath).toString());
	}

	// super hack!
	// we set `ts.version` so that new versions of roblox-ts trigger full re-compile for incremental mode
	// rojoHash makes it so that changes to the rojo config will trigger full re-compile

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	ts.version = COMPILER_VERSION + rojoHash;

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
