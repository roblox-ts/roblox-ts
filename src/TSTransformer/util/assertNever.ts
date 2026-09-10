import { spawnSync } from "child_process";
import kleur from "kleur";
import { LogService } from "Shared/classes/LogService";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";
import util from "util";

type LsInfo = {
	name?: string;
	version?: string;
	dependencies?: Record<string, LsInfo>;
};

function findTypescriptVersion(info: LsInfo, name = info.name): string | undefined {
	if (name === "roblox-ts" && info.dependencies?.typescript) {
		return info.dependencies.typescript.version;
	}
	for (const [name, dep] of Object.entries(info.dependencies ?? {})) {
		const found = findTypescriptVersion(dep, name);
		if (found) {
			return found;
		}
	}
}

function error(message: string): never {
	let typescriptVersion: string | undefined;
	try {
		const result = spawnSync("npm", ["ls", "typescript", "--json"], {
			encoding: "utf8",
			shell: process.platform === "win32",
		});
		if (result.stdout) {
			typescriptVersion = findTypescriptVersion(JSON.parse(result.stdout) as LsInfo);
		}
	} catch {
		// failure to obtain installation advice must not hide the original assertion
	}

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
	const isTsNode =
		value !== null && typeof value === "object" && "kind" in value && ts.isNodeKind((value as ts.Node).kind);
	error(
		`${message}, value was ${isTsNode ? `a TS node of kind ${getKindName((value as ts.Node).kind)}` : util.inspect(value)}`,
	);
}
