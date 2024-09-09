export = () => {
	it("should support if statements", () => {
		function foo(n: number) {
			if (n < 5) {
				return "bar";
			} else if (n < 10) {
				return "foo";
			} else {
				return "baz";
			}
		}
		expect(foo(9)).to.equal("foo");
		expect(foo(4)).to.equal("bar");
		expect(foo(11)).to.equal("baz");
	});

	it("should support prereqs in elseif", () => {
		const array = [1];
		if (true) {
		} else if (array.pop() === 1) {
		}
		expect(array.size()).to.equal(1);
	});
};
