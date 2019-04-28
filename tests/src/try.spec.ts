function stringThrow(): void {
	throw "foo";
}

export = () => {
	it("should throw", () => {
		expect(stringThrow).to.throw();
	});

	it("should throw with strings", () => {
		let message = "";
		try {
			stringThrow();
		} catch (e) {
			if (typeIs(e, "string")) {
				message = e;
			}
		}

		expect(message.match("foo$")).to.equal("foo");
	});

	it("should support catch with strings", () => {
		let value: string;
		try {
			throw "foo";
		} catch (e) {
			value = e;
		}
		expect(value.match("foo$")).to.equal("foo");
	});

	it("should support try without catch", () => {
		let x = 0;
		try {
			x++;
		} finally {
			x++;
		}
		expect(x).to.equal(2);
	});
};
