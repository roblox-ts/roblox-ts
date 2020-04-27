export function assert(value: unknown, message?: string): asserts value {
	if (!value) {
		debugger;
		throw new Error(`Assertion Failed!${message ? ` ${message} ` : ""}`);
	}
}
