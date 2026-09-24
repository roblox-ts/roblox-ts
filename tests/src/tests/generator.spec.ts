export = () => {
	it("should distinguish a bare yield from completion", () => {
		function* generate() {
			yield;
			return 42;
		}

		const iterator = generate();
		const yielded = iterator.next();
		expect(yielded.done).to.equal(false);
		expect(yielded.value).to.equal(undefined);

		const completed = iterator.next();
		expect(completed.done).to.equal(true);
		expect(completed.value).to.equal(42);
	});

	it("should support generator methods", () => {
		class Counter {
			constructor(private value: number) {}

			*values() {
				yield this.value;
				yield ++this.value;
			}
		}

		const values = [...new Counter(4).values()];
		expect(values.join(",")).to.equal("4,5");
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

	it("should forward inputs and completion values through delegated generators", () => {
		function* inner(): Generator<undefined, number, number> {
			return yield;
		}

		function* outer(): Generator<undefined, number, number> {
			return yield* inner();
		}

		const iterator = outer();
		const yielded = iterator.next();
		expect(yielded.done).to.equal(false);
		expect(yielded.value).to.equal(undefined);

		const completed = iterator.next(42);
		expect(completed.done).to.equal(true);
		expect(completed.value).to.equal(42);
	});

	it("should forward inputs through nested delegation", () => {
		function* inner(): Generator<number, number, number> {
			const first = yield 1;
			const second = yield first + 2;
			return second + 3;
		}

		function* middle(): Generator<number, number, number> {
			return yield* inner();
		}

		function* outer(): Generator<number, number, number> {
			return yield* middle();
		}

		const iterator = outer();
		expect(iterator.next().value).to.equal(1);
		expect(iterator.next(10).value).to.equal(12);

		const completed = iterator.next(20);
		expect(completed.done).to.equal(true);
		expect(completed.value).to.equal(23);
	});

	it("should preserve false and undefined inputs during delegation", () => {
		function* inner(): Generator<undefined, boolean | undefined, boolean | undefined> {
			return yield;
		}

		function* outer(): Generator<undefined, boolean | undefined, boolean | undefined> {
			return yield* inner();
		}

		function checkInput(input: boolean | undefined) {
			const iterator = outer();
			iterator.next();

			const completed = iterator.next(input);
			expect(completed.done).to.equal(true);
			expect(completed.value).to.equal(input);
		}

		checkInput(false);
		checkInput(undefined);
	});

	it("should evaluate a delegated iterator once and retain its next function", () => {
		function* inner(): Generator<number, number, number> {
			yield 1;
			return 2;
		}

		let calls = 0;
		const source = inner();
		function getIterator() {
			calls++;
			return source;
		}

		function* outer(): Generator<number, number, number> {
			return yield* getIterator();
		}

		const iterator = outer();
		expect(iterator.next().value).to.equal(1);
		source.next = () => ({ done: true, value: 99 });

		const completed = iterator.next();
		expect(completed.done).to.equal(true);
		expect(completed.value).to.equal(2);
		expect(calls).to.equal(1);
	});
};
