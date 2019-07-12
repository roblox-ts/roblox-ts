export = () => {
	it("should support adding Vector3s", () => {
		const a = new Vector3(1, 2, 3);
		const b = new Vector3(6, 3, 8);
		const c = a.add(b);
		expect(c.X).to.equal(7);
		expect(c.Y).to.equal(5);
		expect(c.Z).to.equal(11);
	});

	it("should support subtracting Vector3s", () => {
		const a = new Vector3(1, 2, 3);
		const b = new Vector3(6, 3, 8);
		const c = b.sub(a);
		expect(c.X).to.equal(5);
		expect(c.Y).to.equal(1);
		expect(c.Z).to.equal(5);
	});

	it("should support multiplying Vector3s", () => {
		const a = new Vector3(1, 2, 3);
		const b = new Vector3(6, 3, 8);
		const c = a.mul(b);
		expect(c.X).to.equal(6);
		expect(c.Y).to.equal(6);
		expect(c.Z).to.equal(24);
	});

	it("should support dividing Vector3s", () => {
		const a = new Vector3(10, 5, 6);
		const b = new Vector3(2, 1, 3);
		const c = a.div(b);
		expect(c.X).to.equal(5);
		expect(c.Y).to.equal(5);
		expect(c.Z).to.equal(2);
	});

	it("should properly support roblox math macros with binary expressions", () => {
		const a = new Vector2(1, 2).mul(1 + 3);
		expect(a.X).to.equal(4);
		expect(a.Y).to.equal(8);
	});
};
