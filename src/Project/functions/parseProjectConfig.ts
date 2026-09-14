import { readProjectOptions } from "Project/functions/readProjectOptions";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { assert } from "Shared/util/assert";
import ts from "typescript";

export function parseProjectConfig(tsConfigPath: string) {
	const parsed = ts.getParsedCommandLineOfConfigFile(
		tsConfigPath,
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: diagnostic => {
				throw new DiagnosticError([diagnostic]);
			},
		},
	);
	assert(parsed);

	if (parsed.errors.length > 0) {
		throw new DiagnosticError(parsed.errors);
	}
	parsed.raw.rbxts = readProjectOptions(tsConfigPath, parsed.raw);

	return parsed;
}
