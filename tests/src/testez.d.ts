interface Expectation {
	/** These keys don't do anything except make expectations read more cleanly */
	to: Expectation;
	/** These keys don't do anything except make expectations read more cleanly */
	be: Expectation;
	/** These keys don't do anything except make expectations read more cleanly */
	been: Expectation;
	/** These keys don't do anything except make expectations read more cleanly */
	have: Expectation;
	/** These keys don't do anything except make expectations read more cleanly */
	was: Expectation;
	/** These keys don't do anything except make expectations read more cleanly */
	at: Expectation;

	/** These keys invert the condition expressed by the Expectation. */
	never: Expectation;

	/**
	 * Assert that the expectation value is the given type.
	 * `expect(5).a("number")`
	 */
	a: (type: string) => void;

	/** Assert that our expectation value is truthy */
	ok: () => void;

	/** Assert that our expectation value is equal to another value */
	equal: (value: unknown) => void;

	/** Assert that our expectation value is equal to another value within some inclusive limit. */
	near: (value: number, limit?: number) => void;

	/** Assert that our functoid expectation value throws an error when called */
	throw: () => void;
}

declare function describe(phrase: string, callback: () => void): void;
declare function expect(value: unknown): Expectation;
declare function FOCUS(): void;
declare function it(phrase: string, callback: () => void): void;
declare function itFOCUS(phrase: string, callback: () => void): void;
declare function itSKIP(phrase: string, callback: () => void): void;
declare function SKIP(): void;
