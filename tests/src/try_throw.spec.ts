export = () => {
	function stringThrow(): void {
		throw "foo";
	}

	function objectThrow(): void {
		throw setmetatable(
			{
				id: "baz",
			},
			{
				__tostring: () => "bar",
			},
		);
	}

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

		expect(message).to.equal("foo");
	});

	it("should allow throwing objects", () => {
		expect(objectThrow).to.throw();

		let object: { id: string } | undefined;
		try {
			objectThrow();
		} catch (e) {
			object = e;
		}

		expect(object).to.be.ok();
		expect(object!.id).to.equal("baz");
	});

	it("should display the error message in output", () => {
		const [ok, errorMessage] = pcall(objectThrow);

		expect(ok).to.equal(false);
		expect((errorMessage as string).find("bar")).to.be.ok();
	});
};
