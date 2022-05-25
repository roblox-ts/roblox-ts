import ts from "typescript";

/**
 * Asserts at compile-time that `value` is `never`, throws at runtime.
 * @param value The value to check the exhaustiveness of
 * @param message The message of the error
 */
export function assertNever(value: never, message: string): never {
	/* istanbul ignore */
	throw new Error(
		`Exhaustiveness Assertion Failed! ${message}, value was ${ts.isNode(value) ? (value as ts.Node).kind : value}` +
			"\nThis is usually caused by a TypeScript version mismatch." +
			"\nMake sure that all TS versions in your project are the same." +
			"\nYou can check the list of installed versions with `npm list typescript`",
	);
}
