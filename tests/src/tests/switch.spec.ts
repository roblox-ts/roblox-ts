/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should support switch statements with fall through", () => {
		function foo(s: string) {
			switch (s) {
				case "a":
				case "b":
					return 1;
				case "c":
					return 2;
				case "d":
					if (true) {
						break;
					}
				// eslint-disable-next-line no-fallthrough
				case "e": {
					return 4;
				}
				default:
					return -1;
			}
			return 3;
		}

		expect(foo("a")).to.equal(1);
		expect(foo("b")).to.equal(1);
		expect(foo("c")).to.equal(2);
		expect(foo("d")).to.equal(3);
		expect(foo("e")).to.equal(4);
		expect(foo("f")).to.equal(-1);
	});

	it("should support switch statements without fall through", () => {
		function bar(s: string) {
			switch (s) {
				case "a":
					return 1;
				case "b":
					return 2;
				case "c":
					return 3;
			}
			return 4;
		}

		expect(bar("a")).to.equal(1);
		expect(bar("b")).to.equal(2);
		expect(bar("c")).to.equal(3);
		expect(bar("d")).to.equal(4);
	});

	it("should support switch statements with remaining empty conditions", () => {
		function bar(s: string) {
			switch (s) {
				case "a":
					return 1;
				case "b":
				case "c":
			}
			return 2;
		}

		expect(bar("a")).to.equal(1);
		expect(bar("b")).to.equal(2);
		expect(bar("c")).to.equal(2);
		expect(bar("d")).to.equal(2);
	});

	it("should support switch statements with context", () => {
		function bar(n: number) {
			let x = 1;
			switch (n) {
				case x++:
					return -1;
				case x++: // eslint-disable-line no-duplicate-case
					return -2;
			}
			return 0;
		}

		expect(bar(1)).to.equal(-1);
		expect(bar(2)).to.equal(-2);
		expect(bar(3)).to.equal(0);
	});

	it("should support switch statements with fallthrough and context", () => {
		function bar(n: number) {
			let x = 1;
			switch (n) {
				case x++:
				case x++: // eslint-disable-line no-duplicate-case
					return -2;
			}
			return 0;
		}

		expect(bar(1)).to.equal(-2);
		expect(bar(2)).to.equal(-2);
		expect(bar(3)).to.equal(0);
	});

	it("should support switch statements with preceding statements", () => {
		function bar(n: number) {
			let x = 1;
			switch (++n) {
				case x++:
				case x++: // eslint-disable-line no-duplicate-case
				case x++: // eslint-disable-line no-duplicate-case
				case x++: // eslint-disable-line no-duplicate-case
					return -2;
			}
			return 0;
		}

		expect(bar(0)).to.equal(-2);
		expect(bar(1)).to.equal(-2);
		expect(bar(2)).to.equal(-2);
		expect(bar(3)).to.equal(-2);
		expect(bar(4)).to.equal(0);
	});

	it("should support switch statements with a boolean value", () => {
		function foo(n: number) {
			switch (true) {
				case n >= 10:
					return 10;
				case n >= 5:
					return 5;
				case n >= 0:
					return 0;
			}
		}

		expect(foo(10)).to.equal(10);
		expect(foo(7)).to.equal(5);
		expect(foo(5)).to.equal(5);
		expect(foo(3)).to.equal(0);
		expect(foo(0)).to.equal(0);
	});
};
