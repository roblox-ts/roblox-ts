export = () => {
	it("should support typeOf", () => {
		expect(typeOf({})).to.equal("table");
		expect(typeOf(undefined)).to.equal("nil");
		expect(typeOf(1)).to.equal("number");
		expect(typeOf("foo")).to.equal("string");
		expect(typeOf(true)).to.equal("boolean");
		expect(typeOf([])).to.equal("table");
		expect(typeOf(new Vector2())).to.equal("Vector2");
	});
};
