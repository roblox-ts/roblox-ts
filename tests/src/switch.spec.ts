// fall through
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
		case "e": {
			return 4;
		}
		default:
			return -1;
	}
	return 3;
}

// no fall through
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

export = () => {
	it("should support switch statements with fall through", () => {
		expect(foo("a")).to.equal(1);
		expect(foo("b")).to.equal(1);
		expect(foo("c")).to.equal(2);
		expect(foo("d")).to.equal(3);
		expect(foo("e")).to.equal(4);
		expect(foo("f")).to.equal(-1);
	});

	it("should support switch statements without fall through", () => {
		expect(bar("a")).to.equal(1);
		expect(bar("b")).to.equal(2);
		expect(bar("c")).to.equal(3);
		expect(bar("d")).to.equal(4);
	});
};
