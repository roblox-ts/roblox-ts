import { spawnSync } from "child_process";
import { CLIError } from "CLI/errors/CLIError";

export interface RojoSourceMap {
	name: string;
	className: string;
	filePaths?: Array<string>;
	children?: Array<RojoSourceMap>;
}

// including non-script instances preserves the root even when the project has no scripts
export function getRojoSourceMap(rojoPath: string, includeNonScripts: true): RojoSourceMap;
export function getRojoSourceMap(rojoPath: string, includeNonScripts?: boolean): RojoSourceMap | null;
export function getRojoSourceMap(rojoPath: string, includeNonScripts = false): RojoSourceMap | null {
	const args = ["sourcemap", rojoPath];
	if (includeNonScripts) {
		args.push("--include-non-scripts");
	}

	// the complete JSON is needed for translation, including maps larger than Node's default buffer
	const { stdout, stderr, error, status } = spawnSync("rojo", args, { maxBuffer: Infinity });
	if (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new CLIError("Rojo is not installed. Please install Rojo from https://rojo.space/");
		}
		throw new CLIError(error.message);
	}
	if (status !== 0) {
		throw new CLIError(`rojo sourcemap returned a non-zero exit code\n\n${stderr.toString()}`);
	}
	return JSON.parse(stdout.toString()) as RojoSourceMap | null;
}
