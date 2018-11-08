// unfortunately, these are the only types and operators that lemur supports

export = () => {
	it("should add UDim values", () => {
		const a = new UDim(1, 10);
		const b = new UDim(0, 5);
		const c = a.add(b);
		expect(c.Scale).to.equal(1);
		expect(c.Offset).to.equal(15);
	});

	it("should add UDim2 values", () => {
		const a = new UDim2(1, 0, 1, 0);
		const b = new UDim2(0, 10, 0, 10);
		const c = a.add(b);
		expect(c.X.Scale).to.equal(1);
		expect(c.X.Offset).to.equal(10);
		expect(c.Y.Scale).to.equal(1);
		expect(c.Y.Offset).to.equal(10);
	});

	it("should add Vector2 vaulues", () => {
		const a = new Vector2(1, 2);
		const b = new Vector2(3, 4);
		const c = a.add(b);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(6);
	});
};
