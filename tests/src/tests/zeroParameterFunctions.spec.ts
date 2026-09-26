export = () => {
	it("should accept zero-parameter declarations and const function bindings", () => {
		function run(implementation: (this: defined, value: number) => number) {
			return { implementation }.implementation(100);
		}
		function declared() {
			return 40;
		}
		const arrow = () => 41;
		const expression = function () {
			return 42;
		};

		expect(run(declared)).to.equal(40);
		expect(run(arrow)).to.equal(41);
		expect(run(expression)).to.equal(42);
		expect(
			run(function (): number {
				return 43;
			} satisfies () => number),
		).to.equal(43);
		expect(
			run(function (this: void) {
				return 44;
			}),
		).to.equal(44);

		function withoutReceiver(this: void) {
			return 45;
		}
		expect(run(withoutReceiver)).to.equal(45);

		const object: { declared(): number; arrow(): number; expression(): number } = {
			declared,
			arrow,
			expression,
		};
		expect(object.declared()).to.equal(40);
		expect(object.arrow()).to.equal(41);
		expect(object.expression()).to.equal(42);
	});

	it("should check zero-parameter overload implementations", () => {
		function overloaded(): number;
		function overloaded(value: number): number;
		function overloaded() {
			return 42;
		}

		const object: { implementation(value: number): number } = { implementation: overloaded };
		expect(object.implementation(100)).to.equal(42);
	});

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
