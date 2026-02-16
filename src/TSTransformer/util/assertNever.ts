import { spawnSync } from "child_process";
import kleur from "kleur";
import { LogService } from "Shared/classes/LogService";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";
import util from "util";

type LsInfo = {
	name: string;
	version: string;
	dependencies: Record<string, LsInfo>;
};

function findTypescriptVersion(info: LsInfo): string | undefined {
	if (info.name === "roblox-ts" && info.dependencies.typescript) {
		return info.dependencies.typescript.version;
	}
	for (const [, dep] of Object.entries(info.dependencies)) {
		const found = findTypescriptVersion(dep);
		if (found) {
			return found;
		}
	}
}

function error(message: string): never {
	/* istanbul ignore */
	const typescriptVersion = findTypescriptVersion(
		JSON.parse(spawnSync("npm ls typescript --json").stdout.toString()) as LsInfo,
	);
	LogService.fatal(
		kleur.red(`Exhaustive assertion failed! ${message}`) +
			kleur.yellow("\nThis is usually caused by a TypeScript version mismatch.") +
			kleur.yellow("\nMake sure that all TS versions in your project are the same.") +
			kleur.yellow("\nYou can check the list of installed versions with `npm list typescript`") +
			(typescriptVersion ? kleur.yellow(`\nTry running \`npm install typescript@=${typescriptVersion}\``) : ""),
	);
}

/**
 * Asserts at compile-time that `value` is `never`, throws at runtime.
 * @param value The value to check the exhaustiveness of
 * @param message The message of the error
 */
export function assertNever(value: never, message: string): never {
	/* istanbul ignore */
	const isTsNode = typeof value === "object" && "kind" in value && ts.isNodeKind(value);
	error(
		`${message}, value was ${isTsNode ? `a TS node of kind ${getKindName((value as ts.Node).kind)}` : util.inspect(value)}`,
	);
}
