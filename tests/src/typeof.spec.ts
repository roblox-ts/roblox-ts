export = () => {
	it("should support typeof", () => {
		expect(typeof {}).to.equal("object");
		expect(typeof undefined).to.equal("undefined");
		expect(typeof 1).to.equal("number");
		expect(typeof "foo").to.equal("string");
		expect(typeof true).to.equal("boolean");
		expect(typeof []).to.equal("object");
		expect(typeof new Vector2()).to.equal("Vector2");
	});
};
