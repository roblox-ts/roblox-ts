/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should support variable hoisting", () => {
		function test() {
			expect(x).to.equal(1);
		}
		const x = 1;
		test();
	});

	it("should hoist classes", () => {
		function test() {
			const foo = new Foo();
			expect(foo.bar()).to.equal("baz");
		}
		class Foo {
			bar() {
				return "baz";
			}
		}
		test();
	});
};
