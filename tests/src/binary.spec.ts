export = () => {
	it("should support binary expressions on properties", () => {
		const foo = {
			bar: 1,
		};
		foo.bar++;
		expect(foo.bar).to.equal(2);
	});

	it("should support binary assignment on properties", () => {
		const foo = {
			bar: 1,
		};
		foo.bar += 1;
		expect(foo.bar).to.equal(2);
	});

	it("should support computedPropertyAccessExpressions requiring precedingStatements", () => {
		let x = 0;

		const arr = [3, 4, 5];

		function f() {
			return ++x;
		}

		expect((arr[f()] *= ++x)).to.equal(8);
		expect(x).to.equal(2);
	});
};
