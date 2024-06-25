export = () => {
	describe("should support optional function calls", () => {
		const foo = (() => "bar") as (() => void) | undefined;
		expect(foo?.()).to.equal("bar");
	});
};
