export = () => {
	it("should properly fetch types with parenthesis and nonNull assertions", () => {
		function loop(array?: Array<number>) {
			let i = 0;
			// prettier-ignore
			for (const value of ((array)!)!) expect(value).to.equal(i++);
		}

		loop([0, 1, 2, 3]);
	});
	it("should support instantiated expressions", () => {
		function wow<T extends string>(str: T) {
			return str;
		}
		const foo = wow<"foo">;
		expect(foo("foo")).to.equal("foo");
	});
};
