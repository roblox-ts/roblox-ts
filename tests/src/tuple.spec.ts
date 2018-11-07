function foo(): [number, number] {
	return [101, 203];
}

export = () => {
	it("should unpack function return tuples", () => {
		const [a, b] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(203);

		const c = foo();
		expect(c[0]).to.equal(101);
		expect(c[1]).to.equal(203);
	});
};
