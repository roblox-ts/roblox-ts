export = () => {
	it("should allow function declarations", () => {
		function foo() {
			return true;
		}
		expect(foo()).to.be.ok();
	});

	it("should allow function arguments", () => {
		function add(a: number, b: number) {
			return a + b;
		}
		expect(add(123, 456)).to.equal(579);
	});

	it("should allow variadic arguments", () => {
		function addAll(...n: Array<number>) {
			let sum = 0;
			for (const value of n) {
				sum += value;
			}
			return sum;
		}
		expect(addAll()).to.equal(0);
		expect(addAll(1)).to.equal(1);
		expect(addAll(1, 2, 3)).to.equal(6);
	});

	it("should allow default arguments", () => {
		function addSeven(n = 5) {
			return n + 7;
		}
		expect(addSeven()).to.equal(12);
		expect(addSeven(7)).to.equal(14);
	});

	it("should allow function expressions", () => {
		/* tslint:disable */
		expect(
			(function() {
				return 123;
			})(),
		).to.equal(123);
		/* tslint:enable */
	});

	it("should allow arrow functions", () => {
		expect(
			(() => {
				return 456;
			})(),
		).to.equal(456);
	});

	it("should allow binding patterns", () => {
		function foo({ a }: { a: number }) {
			return a * 2;
		}
		expect(foo({ a: 4 })).to.equal(8);

		function bar([a, b]: [number, number]) {
			return a * b;
		}
		expect(bar([4, 7])).to.equal(28);
	});
};
