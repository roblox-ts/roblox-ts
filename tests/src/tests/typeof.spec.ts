export = () => {
	it("should inspect method types without calling the methods", () => {
		let calls = 0;
		const object = {
			method() {
				calls++;
			},
		};

		expect(typeIs(object.method, "function")).to.equal(true);
		expect(typeOf(object.method)).to.equal("function");
		expect(calls).to.equal(0);
	});

	it("should support typeOf", () => {
		expect(typeOf({})).to.equal("table");
		expect(typeOf(undefined)).to.equal("nil");
		expect(typeOf(1)).to.equal("number");
		expect(typeOf("foo")).to.equal("string");
		expect(typeOf(true)).to.equal("boolean");
		expect(typeOf([])).to.equal("table");
		expect(typeOf(new Vector2())).to.equal("Vector2");
	});

	it("should support typeIs", () => {
		expect(typeIs({}, "table")).to.equal(true);
		expect(typeIs(undefined, "nil")).to.equal(true);
		expect(typeIs(1, "number")).to.equal(true);
		expect(typeIs("foo", "string")).to.equal(true);
		expect(typeIs(true, "boolean")).to.equal(true);
		expect(typeIs([], "table")).to.equal(true);
		expect(typeIs(new Vector2(), "Vector2")).to.equal(true);

		// make sure this doesn't produce invalid Lua
		typeIs("Hello, world!", "string");
		typeIs("Hello, world!", "string")!;
		!typeIs("Hello, world!", "string");
		!typeIs("Hello, world!", "string")!;
		const lel = !typeIs("Hello, world!", "string");

		if (typeIs("Hello, world!", "string")) {
		}

		typeIs("s", "table");
	});
};
