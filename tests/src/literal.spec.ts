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

	it("should support string methods", () => {
		const foo = " foo ";
		expect(foo.trim()).to.equal("foo");
		expect(foo.trimLeft()).to.equal("foo ");
		expect(foo.trimRight()).to.equal(" foo");
	});

	it("should allow postfix operators on properties", () => {
		const obj = { x: 0 };
		expect(obj.x).to.equal(0);
		obj.x++;
		expect(obj.x).to.equal(1);
		obj.x--;
		expect(obj.x).to.equal(0);
		expect(obj.x++).to.equal(0);
		expect(obj.x).to.equal(1);
		expect(obj.x--).to.equal(1);
		expect(obj.x).to.equal(0);
	});
};
