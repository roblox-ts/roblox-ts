export = () => {
	function stringThrow(): void {
		throw "foo";
	}

	function objectThrow(): void {
		throw setmetatable({
			id: "baz"
		}, {
			__tostring: () => "bar"
		});
	}

	it("should throw", () => {
		expect(stringThrow).to.throw();
	});

	it("should throw with strings", () => {
		let message;
		try {
			stringThrow();
		} catch (e) {
			message = e;
		}

		expect(message).to.be.a("string");
	});

	it("should allow throwing objects", () => {
		expect(objectThrow).to.throw();

		let object;
		try {
			objectThrow();
		} catch (e) {
			object = e;
		}

		expect(object).to.be.ok();
		expect(object.id).to.equal("baz");
	});

	it("should display the error message in output", () => {
		const [ok, errorMessage] = pcall<[], any>(objectThrow);

		expect(ok).to.equal(false)
		expect(errorMessage.find("bar")).to.be.ok()
	})
};
