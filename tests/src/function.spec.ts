export = () => {
	it("should support function declarations", () => {
		function foo() {
			return true;
		}
		expect(foo()).to.be.ok();
	});

	it("should support function arguments", () => {
		function add(a: number, b: number) {
			return a + b;
		}
		expect(add(123, 456)).to.equal(579);
	});

	it("should support no return value", () => {
		function doStuff(doIHaveToMom: boolean) {
			if (doIHaveToMom) {
				return "cleans room";
			} else {
				return;
			}
		}

		expect(doStuff(true)).to.equal("cleans room");
		expect(doStuff(false)).never.to.be.ok();
	});

	it("should support destructuring in assignment", () => {
		function addAndMultiply(a: number, b: number): [number, number] {
			const sum = a + b;
			const product = a * b;
			return [sum, product];
		}

		const [x, y] = addAndMultiply(5, 6);

		expect(x).to.equal(11);
		expect(y).to.equal(30);
	});

	it("should support variadic arguments", () => {
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

	it("should support default arguments", () => {
		function addSeven(n = 5) {
			return n + 7;
		}
		expect(addSeven()).to.equal(12);
		expect(addSeven(7)).to.equal(14);
	});

	it("should support function expressions", () => {
		expect(
			(function() {
				return 123;
			})(),
		).to.equal(123);
	});

	it("should support arrow functions", () => {
		expect(
			(() => {
				return 456;
			})(),
		).to.equal(456);
	});

	it("should support binding patterns", () => {
		function foo({ a }: { a: number }) {
			return a * 2;
		}
		expect(foo({ a: 4 })).to.equal(8);

		function bar([a, b]: [number, number]) {
			return a * b;
		}
		expect(bar([4, 7])).to.equal(28);
	});

	it("should support this parameter", () => {
		function foo(this: void, x: number, y: number, z: number) {
			return `${x}, ${y}, ${z}`;
		}
		expect(foo(1, 2, 3)).to.equal("1, 2, 3");
	});
};
