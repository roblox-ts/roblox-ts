/// <reference types="@rbxts/testez/globals" />

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
};
