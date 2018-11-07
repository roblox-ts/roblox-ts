export = () => {
	FOCUS();
	it("should properly add numbers", () => {
		expect(1 + 1).to.equal(2);
	});

	it("should properly add strings", () => {
		expect("a" + "b").to.equal("ab");
	});

	it("should properly add numbers and strings", () => {
		expect("1" + 1).to.equal("11");
		expect(1 + "1").to.equal("11");
	});
};
