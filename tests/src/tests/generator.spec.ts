export = () => {
	it("should support generator function declarations", () => {
		function* foo() {
			yield 1;
			return 2;
		}
		expect(foo()).to.be.ok();
	});

	it("should support no return value", () => {
		function* foo() {
			yield 1;
		}

		for (const result of foo()) {
			expect(result).to.equal(1);
		}
	});

	it("should support multiple yields", () => {
		function* foo() {
			yield 10;
			yield 20;
		}

		const result = [...foo()];
		expect(result.size()).to.equal(2);
		expect(result[0]).to.equal(10);
		expect(result[1]).to.equal(20);
	});

	it("should support yield with asterisk token", () => {
		function* foo() {
			yield 1;
		}

		function* bar() {
			yield* foo();
		}

		const result = [...bar()];
		expect(result.size()).to.equal(1);
		expect(result[0]).to.equal(1);
	});

	it("should not resume finished generator", () => {
		function* foo() {
			yield 1;
		}

		function* bar() {
			const generated = foo();
			yield* generated;
			yield* generated;
		}

		const result = [...bar()];
		expect(result.size()).to.equal(1);
		expect(result[0]).to.equal(1);
	});

	it("should properly define yield vs return", () => {
		function* a() {
			yield 1;
			yield 2;
			return 3;
		}

		function* c() {
			return 61;
		}

		function* b() {
			yield 0;
			yield* c();
			const output = yield* a();
			yield output;
			yield 4;
			return 5;
		}

		const result = [...b()];
		expect(result.size()).to.equal(5);
		expect(result[0]).to.equal(0);
		expect(result[1]).to.equal(1);
		expect(result[2]).to.equal(2);
		expect(result[3]).to.equal(3);
		expect(result[4]).to.equal(4);
	});
};
