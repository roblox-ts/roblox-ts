export = () => {
	it("should accept throwing and no-op arrows as method implementations", () => {
		function mockImplementation(implementation: (this: defined) => void) {
			return { implementation };
		}

		const throwing = mockImplementation(() => {
			throw "rate-limited";
		});
		expect(() => throwing.implementation()).to.throw("rate-limited");

		const noop = mockImplementation(() => {});
		expect(() => noop.implementation()).never.to.throw();
	});

	it("should ignore receivers and arguments in method-typed arrow literals", () => {
		type Method = (this: defined | void, value: number) => number;
		let implementation: Method = () => 40;
		expect(implementation(100)).to.equal(40);

		implementation = () => 41;
		expect(implementation(100)).to.equal(41);

		function make(): Method {
			return () => 42;
		}
		function run(callback: Method = () => 43) {
			return callback(100);
		}
		const callbacks: Array<Method> = [() => 44];
		expect(make()(100)).to.equal(42);
		expect(run()).to.equal(43);
		expect(callbacks[0](100)).to.equal(44);
	});

	it("should accept zero-parameter arrows in method properties", () => {
		const object: { method(value: number): number; explicit: (this: defined) => number } = {
			method: () => 41,
			explicit: (() => 42) satisfies () => number,
		};
		expect(object.method(100)).to.equal(41);
		expect(object.explicit()).to.equal(42);

		object.method = () => 43;
		expect(object.method(100)).to.equal(43);
	});

	it("should preserve lexical this in method-typed zero-parameter arrows", () => {
		class Example {
			value = 42;

			make() {
				const object: { value: number; method(): number } = {
					value: 100,
					method: () => this.value,
				};
				return object;
			}
		}

		expect(new Example().make().method()).to.equal(42);
	});
};
