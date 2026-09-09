export = () => {
	it("should support SharedTable iteration with for...of", () => {
		const sharedTable = new SharedTable();
		sharedTable.a = 1;
		sharedTable.b = 2;
		sharedTable.c = 3;

		const expected = new Map<string | number, number>([
			["a", 1],
			["b", 2],
			["c", 3],
		]);

		for (const [key, value] of sharedTable) {
			expect(value).to.equal(expected.get(key));
			expect(expected.delete(key)).to.equal(true);
		}
	});

	it("should support SharedTable destructuring", () => {
		const sharedTable = new SharedTable();
		sharedTable.a = 1;
		sharedTable.b = 2;
		sharedTable.c = 3;

		const { a, b, c } = sharedTable;
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
	});

	it("should support SharedTable spread", () => {
		const sharedTable = new SharedTable();
		sharedTable.a = 1;
		sharedTable.b = 2;
		sharedTable.c = 3;

		const expected = new Map<string | number, number>([
			["a", 1],
			["b", 2],
			["c", 3],
		]);

		const result = [...sharedTable];

		expect(expected.get(result[0][0])).to.equal(result[0][1]);
		expect(expected.delete(result[0][0])).to.equal(true);

		expect(expected.get(result[1][0])).to.equal(result[1][1]);
		expect(expected.delete(result[1][0])).to.equal(true);

		expect(expected.get(result[2][0])).to.equal(result[2][1]);
		expect(expected.delete(result[2][0])).to.equal(true);
	});
};
