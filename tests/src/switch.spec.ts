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
		default:
			return -1;
	}
	return 3;
}

export = () => {
	it("should support switch statements", () => {
		expect(foo("a")).to.equal(1);
		expect(foo("b")).to.equal(1);
		expect(foo("c")).to.equal(2);
		expect(foo("d")).to.equal(3);
		expect(foo("e")).to.equal(-1);
	});
};
