export = () => {
	it("should preserve uninitialized bindings captured by earlier closures", () => {
		const read = () => value;
		let value: number | undefined;
		expect(read()).to.equal(undefined);
		value = 42;
		expect(read()).to.equal(42);
	});

	it("should hoist declarations across default switch clauses", () => {
		function read(input: number) {
			switch (input) {
				case 1:
					return () => value;
				default:
					const value = 42;
					return () => value;
			}
		}
		expect(read(0)()).to.equal(42);
		expect(read(1)()).to.equal(undefined);
	});

	it("should hoist async functions referenced by earlier closures", () => {
		function read() {
			return value();
		}
		async function value() {
			return 42;
		}

		const [success, result] = read().await();
		expect(success).to.equal(true);
		expect(result).to.equal(42);
	});

	it("should hoist enums referenced by earlier closures", () => {
		function read() {
			return Choice.First;
		}
		function initialValue() {
			return 42;
		}
		enum Choice {
			First = initialValue(),
		}

		expect(read()).to.equal(42);
	});

	it("should hoist destructured bindings across switch cases", () => {
		const results = new Array<number>();
		function run(value: number) {
			switch (value) {
				case 0:
					const [first, second] = [1, 2];
					results.push(first);
				case 1:
					const read = () => results.push(first, second);
					read();
					break;
			}
		}

		run(0);
		expect(results.join(",")).to.equal("1,1,2");
	});

	it("should support variable hoisting", () => {
		function test() {
			expect(x).to.equal(1);
		}
		const x = 1;
		test();
	});

	it("should hoist classes", () => {
		function test() {
			const foo = new Foo();
			expect(foo.bar()).to.equal("baz");
		}
		class Foo {
			bar() {
				return "baz";
			}
		}
		test();
	});
};
