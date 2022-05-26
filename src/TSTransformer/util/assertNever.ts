import kleur from "kleur";
import { LogService } from "Shared/classes/LogService";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";
import util from "util";

function error(message: string): never {
	/* istanbul ignore */
	LogService.fatal(
		kleur.red(`Exhaustive assertion failed! ${message}`) +
			kleur.yellow("\nThis is usually caused by a TypeScript version mismatch.") +
			kleur.yellow("\nMake sure that all TS versions in your project are the same.") +
			kleur.yellow("\nYou can check the list of installed versions with `npm list typescript`") +
			kleur.yellow("\nThen try running `npm install typescript@=<version listed under roblox-ts>`"),
	);
}

/**
 * Asserts at compile-time that `value` is `never`, throws at runtime.
 * @param value The value to check the exhaustiveness of
 * @param message The message of the error
 */
export function assertNever(value: never, message: string): never {
	/* istanbul ignore */
	const isTsNode = "kind" in value && ts.isNode(value);
	error(
		`${message}, value was ${isTsNode ? `a TS node of kind ${getKindName((value as ts.Node).kind)}` : util.inspect(value)}`,
	);
}
