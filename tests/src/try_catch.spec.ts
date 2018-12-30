export = () => {
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
};
