/**
 * Asserts the truthiness of `value`, stops the debugger on failure.
 * @param value The value to check the truthiness of
 * @param message Optional. The message of the error
 */
export function assert(value: unknown, message?: string): asserts value {
	if (!value) {
		debugger;
		// TODO instruct user to post issue
		throw new Error(["Assertion Failed!", message].join(" "));
	}
}
