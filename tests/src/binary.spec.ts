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
};
