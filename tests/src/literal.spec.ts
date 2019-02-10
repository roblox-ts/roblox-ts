export = () => {
	it("should understand number literals", () => {
		expect(1).to.equal(1);
		expect(6).to.equal(6);
		expect(0xf00d).to.equal(61453);
		expect(0b1010).to.equal(10);
		expect(0o744).to.equal(484);

		// issue #213
		expect(0.0000000000001).never.to.equal(1);
		expect(100000000000000).never.to.equal(1);
		expect(tostring(0.0000000000001)).to.equal("1e-13");
		expect(tostring(100000000000000)).to.equal("1e+14");
	});

	it("should add numbers", () => {
		expect(1 + 1).to.equal(2);
		const a = 1;
		const b = 1;
		expect(a + b).to.equal(2);
	});

	// prettier-ignore
	it("should understand string literals", () => {
		expect("foo").to.equal("foo");
		expect('foo').to.equal("foo");
		expect(`foo`).to.equal("foo");
		expect("foo".length).to.equal(3);
		expect('foo'.length).to.equal(3);
		expect(`foo`.length).to.equal(3);
		expect("\"").to.equal("\"");
		expect(`\"`).to.equal("\"");
		expect('\"').to.equal("\"");
		expect(`"`).to.equal("\"");
		expect('"').to.equal("\"");
	});

	it("should understand string templates", () => {
		const value = "hello";
		expect(`"${value} world"`).to.equal('"hello world"');
		expect(`"${value}" world`).to.equal('"hello" world');
		expect(`${value} "world"`).to.equal('hello "world"');
		expect(`a${"b"}c${"d"}e`).to.equal("abcde");
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
		const a: number | string = "a";
		const b: number | string = "b";
		const one: number | string = 1;
		const two: number | string = 2;

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

	it("should support ===", () => {
		const a = (() => false)();
		const b = (() => true)();
		expect(a === a).to.equal(true);
		expect(a === b).to.equal(false);
		expect(b === b).to.equal(true);
		expect(b === a).to.equal(false);
	});

	it("should support !==", () => {
		const a = (() => false)();
		const b = (() => true)();
		expect(a !== a).to.equal(false);
		expect(a !== b).to.equal(true);
		expect(b !== b).to.equal(false);
		expect(b !== a).to.equal(true);
	});

	it("should support &&", () => {
		const a = false;
		const b = true;
		expect(a && a).to.equal(false);
		expect(a && b).to.equal(false);
		expect(b && b).to.equal(true);
		expect(b && a).to.equal(false);
	});

	it("should support ||", () => {
		const a = false;
		const b = true;
		expect(a || a).to.equal(false);
		expect(a || b).to.equal(true);
		expect(b || b).to.equal(true);
		expect(b || a).to.equal(true);
	});

	it("should support `in`", () => {
		const foo = {
			a: 1,
		};
		expect("a" in foo).to.equal(true);
		expect("b" in foo).to.equal(false);
	});

	it("should support <", () => {
		expect(1 < 2).to.equal(true);
		expect(2 < 1).to.equal(false);
		expect(2 < 2).to.equal(false);
	});

	it("should support >", () => {
		expect(1 > 2).to.equal(false);
		expect(2 > 1).to.equal(true);
		expect(2 > 2).to.equal(false);
	});

	it("should support <=", () => {
		expect(1 <= 2).to.equal(true);
		expect(2 <= 1).to.equal(false);
		expect(2 <= 2).to.equal(true);
	});

	it("should support >=", () => {
		expect(1 >= 2).to.equal(false);
		expect(2 >= 1).to.equal(true);
		expect(2 >= 2).to.equal(true);
	});

	it("should support !", () => {
		expect(!false).to.equal(true);
		expect(!true).to.equal(false);
	});

	it("should support ternary expressions", () => {
		expect(true ? 1 : 0).to.equal(1);
		expect(false ? 1 : 0).to.equal(0);
		expect(true ? false : true).to.equal(false);
		expect(false ? false : true).to.equal(true);
	});
};
