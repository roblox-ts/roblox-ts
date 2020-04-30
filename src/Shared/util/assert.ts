/**
 * asserts a value's truthiness, stops the debugger on failure
 */
export function assert(value: unknown, message?: string): asserts value {
	if (!value) {
		debugger;
		// TODO instruct user to post issue
		throw new Error(`Assertion Failed!${message ? ` ${message}` : ""}`);
	}
}
