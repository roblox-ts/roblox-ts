export = () => {
	it("should add numbers", () => {
		expect(1 + 1).to.equal(2);
		const a = 1;
		const b = 1;
		expect(a + b).to.equal(2);
	});

	it("should add strings", () => {
		expect("a" + "b").to.equal("ab");
		const a = "a";
		const b = "b";
		expect(a + b).to.equal("ab");
	});

	it("should add numbers and strings", () => {
		const a = "2";
		const b = 1;
		expect(a + b).to.equal("21");
		expect(b + a).to.equal("12");
	});

	it("should add unknown types", () => {
		const a: any = "a";
		const b: any = "b";
		const one: any = 1;
		const two: any = 2;

		expect(a + a).to.equal("aa");
		expect(a + b).to.equal("ab");
		expect(a + one).to.equal("a1");
		expect(a + two).to.equal("a2");

		expect(b + a).to.equal("ba");
		expect(b + b).to.equal("bb");
		expect(b + one).to.equal("b1");
		expect(b + two).to.equal("b2");

		expect(one + a).to.equal("1a");
		expect(one + b).to.equal("1b");
		expect(one + one).to.equal(2);
		expect(one + two).to.equal(3);

		expect(two + a).to.equal("2a");
		expect(two + b).to.equal("2b"); // or !2b
		expect(two + one).to.equal(3);
		expect(two + two).to.equal(4);
	});
};
