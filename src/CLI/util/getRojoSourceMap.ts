import { execSync, spawnSync } from "child_process";
import { CLIError } from "CLI/errors/CLIError";

export interface RojoSourceMap {
	name: string;
	className: string;
	filePaths?: Array<string>;
	children?: Array<RojoSourceMap>;
}

export function isProcessOnPath(processName: string) {
	const which = process.platform === "win32" ? "where" : "which";
	try {
		const output = execSync(`${which} ${processName}`);
		return output.toString().trim().length > 0;
	} catch {
		return false;
	}
}

export function getRojoSourceMap(rojoPath?: string, includeNonScripts?: boolean): RojoSourceMap {
	if (!isProcessOnPath("rojo")) {
		throw new CLIError("Rojo is not installed. Please install Rojo from https://rojo.space/");
	}

	const args = ["sourcemap"];
	if (rojoPath) args.push(rojoPath);
	if (includeNonScripts) args.push("--include-non-scripts");
	const { stdout, stderr, error, status } = spawnSync("rojo", args);
	if (error) {
		throw new CLIError(error.message);
	}
	if (status !== 0) {
		throw new CLIError(`rojo sourcemap returned a non-zero exit code\n\n${stderr.toString()}`);
	}
	return JSON.parse(stdout.toString()) as RojoSourceMap;
}
