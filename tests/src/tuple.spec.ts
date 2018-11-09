export = () => {
	it("should unpack function return tuples", () => {
		function foo(): [number, number] {
			return [101, 203];
		}
		const [a, b] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(203);

		const c = foo();
		expect(c[0]).to.equal(101);
		expect(c[1]).to.equal(203);

		expect(foo()[0]).to.equal(101);
		expect(foo()[1]).to.equal(203);
	});

	it("should support wrapping function results", () => {
		function foo() {
			return [1, 2, 3];
		}
		expect(foo()[0]).to.equal(1);
		expect(foo()[1]).to.equal(2);
		expect(foo()[2]).to.equal(3);
	});
};
