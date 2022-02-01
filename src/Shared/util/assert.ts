/**
 * Asserts the truthiness of `value`, stops the debugger on failure.
 * @param value The value to check the truthiness of
 * @param message Optional. The message of the error
 */
export function assert(value: unknown, message?: string): asserts value;
export function assert(value: false, message?: string): never;
export function assert(value: unknown, message?: string): asserts value {
	/* istanbul ignore if */
	if (!value) {
		debugger;
		throw new Error(
			`Assertion Failed! ${message ?? ""}` +
				"\nThis is a compiler bug! Please submit a bug report here:" +
				"\nhttps://github.com/roblox-ts/roblox-ts/issues",
		);
	}
}
