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

	it("should support try catch with return values", () => {
		function foo(n: number) {
			try {
				if (n < 5) {
					throw "Bad n!";
				}
				return 1;
			} catch (e) {
				return -1;
			}
		}
		expect(foo(5)).to.equal(1);
		expect(foo(4)).to.equal(-1);
	});

	it("should support catch with strings", () => {
		let value: string;
		try {
			throw "foo";
		} catch (e) {
			value = e;
		}
		expect(value).to.equal("foo");
	});

	it("should support catch with objects", () => {
		interface MyObject {
			id: string;
		}

		let value: MyObject;
		try {
			throw { id: "foo" };
		} catch (e) {
			value = e;
		}
		expect(value.id).to.equal("foo");
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
