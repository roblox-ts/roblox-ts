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
	contentsToHash += `options=${JSON.stringify({
		...data.projectOptions,
		watch: undefined,
		usePolling: undefined,
		verbose: undefined,
		noInclude: undefined,
		writeOnlyChanged: undefined,
	})},`;
	contentsToHash += `references=${JSON.stringify(Array.from(data.projectReferencePaths ?? []))},`;

	if (data.rojoConfigFiles) {
		contentsToHash += JSON.stringify([...data.rojoConfigFiles]);
	} else if (data.rojoConfigPath && fs.existsSync(data.rojoConfigPath)) {
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
	projectReferences?: ReadonlyArray<ts.ProjectReference>,
): ts.CreateProgram<ts.EmitAndSemanticDiagnosticsBuilderProgram> {
	return (
		rootNames: ReadonlyArray<string> | undefined,
		compilerOptions: ts.CompilerOptions | undefined = options,
		host = createCompilerHost(data, options),
		oldProgram = ts.readBuilderProgram(options, createReadBuildProgramHost()),
		configFileParsingDiagnostics?: ReadonlyArray<ts.Diagnostic>,
		refs = projectReferences,
	) => {
		const previousProgram = oldProgram?.getProgramOrUndefined();
		if (previousProgram) {
			// a fresh host cannot validate the previous program's cached module resolutions
			host.hasInvalidatedResolutions ??= () => true;

			const getSourceFile = host.getSourceFile;
			host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
				const previous = previousProgram.getSourceFile(fileName);
				const sourceFile = previous?.redirectInfo?.unredirected ?? previous;
				const target = typeof languageVersion === "object" ? languageVersion.languageVersion : languageVersion;
				const impliedFormat =
					typeof languageVersion === "object" ? languageVersion.impliedNodeFormat : undefined;
				if (
					sourceFile &&
					!shouldCreateNewSourceFile &&
					sourceFile.languageVersion === target &&
					sourceFile.impliedNodeFormat === impliedFormat
				) {
					const text = host.readFile(fileName);
					// a retained builder only saves parsing and binding when the host returns the same source files
					if (
						text === sourceFile.text &&
						sourceFile.version === ts.getSourceFileVersionAsHashFromText(host, text)
					) {
						return sourceFile;
					}
				}
				return getSourceFile.call(host, fileName, languageVersion, onError, shouldCreateNewSourceFile);
			};
		}

		return ts.createEmitAndSemanticDiagnosticsBuilderProgram(
			rootNames,
			compilerOptions,
			host,
			oldProgram,
			configFileParsingDiagnostics,
			refs,
		);
	};
}
