namespace N {
	export const a = function (this: typeof N, n: 5) {
		return n;
	};
	export const b = function (this: void, n: 5) {
		return n;
	};
	export const c = function (n: 5) {
		return n;
	};
	export const d = (n: 5) => {
		return n;
	};
	export function e(this: typeof N, n: 5) {
		return n;
	}
	export function f(this: void, n: 5) {
		return n;
	}
	export function g(n: 5) {
		return n;
	}
}

export = () => {
	it("should honor instantiated generic this types", () => {
		type Callable<T> = (this: T, value: number) => number;
		const callback: Callable<void> = value => value + 1;
		expect(callback(41)).to.equal(42);

		const object: { value: number; callback: Callable<void>; method: Callable<{ value: number }> } = {
			value: 10,
			callback,
			method(value) {
				return this.value + value;
			},
		};

		expect(object.callback(41)).to.equal(42);
		expect(object.method(32)).to.equal(42);
		expect(object["callback"](41)).to.equal(42);
		expect(object["method"](32)).to.equal(42);

		const optional: typeof object | undefined = (() => object)();
		expect(optional?.callback(41)).to.equal(42);
		expect(optional?.method(32)).to.equal(42);
	});

	it("should destructure nested rest parameters without defaults", () => {
		function add(...[[first], { second }]: [[number], { second: number }]) {
			return first + second;
		}

		expect(add([1], { second: 2 })).to.equal(3);
	});

	it("should preserve a constrained generic callback in an object property", () => {
		function call<T extends () => number>(callback: T) {
			const object: { callback: () => number } = { callback };
			return object.callback();
		}

		expect(call(() => 42)).to.equal(42);
	});

	it("should preserve omitted rest parameters and evaluate defaults lazily", () => {
		let defaults = 0;
		function read(...[, value = ++defaults]: [number, number?]) {
			return value;
		}

		expect(read(10, 42)).to.equal(42);
		expect(defaults).to.equal(0);
		expect(read(10)).to.equal(1);
		expect(defaults).to.equal(1);
	});

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
			(function () {
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

	it("should properly define and call methods vs callbacks", () => {
		class A {
			static a(this: void, n: 5) {
				expect(this).to.equal(undefined);
				expect(n).to.equal(5);
			}
			static b(this: typeof A, n: 5) {
				expect(this).to.equal(A);
				expect(n).to.equal(5);
			}
			static c(n: 5) {
				expect(n).to.equal(5);
			}
			public d(this: void, n: 5) {
				expect(this).to.equal(undefined);
				expect(n).to.equal(5);
			}
			public e = function (n: 5) {
				expect(n).to.equal(5);
			};
			public f = function (this: A, n: 5) {
				expect(this instanceof A).to.equal(true);
				expect(n).to.equal(5);
			};
			public g = (n: 5) => {
				expect(n).to.equal(5);
			};
			public h(this: this, n: 5) {
				expect(this instanceof A).to.equal(true);
				expect(n).to.equal(5);
			}
		}

		const o = {
			a(this: void, n: 5) {
				expect(this).to.equal(undefined);
				expect(n).to.equal(5);
			},
			b(n: 5) {
				expect(this).to.equal(o);
				expect(n).to.equal(5);
			},
			c: function (this: void, n: 5) {
				expect(this).to.equal(undefined);
				expect(n).to.equal(5);
			},
			d: function (n: 5) {
				expect(this).to.equal(o);
				expect(n).to.equal(5);
			},
			e: (n: 5) => {
				expect(n).to.equal(5);
			},
			f(this: {}, n: 5) {
				expect(this).to.equal(o);
				expect(n).to.equal(5);
			},
			g: function (this: {}, n: 5) {
				expect(this).to.equal(o);
				expect(n).to.equal(5);
			},
		};

		function f(this: void, n: 5) {
			// expect(this).to.equal(undefined);
			expect(n).to.equal(5);
		}

		const g = function (this: void, n: 5) {
			// expect(this).to.equal(undefined);
			expect(n).to.equal(5);
		};

		A.a(5);
		A.b(5);
		A.c(5);
		const a = new A();
		a.d(5);
		a.e(5);
		a.f(5);
		a.g(5);
		a.h(5);

		o.a(5);
		o.b(5);
		o.c(5);
		o.d(5);
		o.e(5);
		o.f(5);
		o.g(5);

		expect(N.a(5)).to.equal(5);
		expect(N.b(5)).to.equal(5);
		expect(N.c(5)).to.equal(5);
		expect(N.d(5)).to.equal(5);
		expect(N.e(5)).to.equal(5);
		expect(N.f(5)).to.equal(5);
		expect(N.g(5)).to.equal(5);

		f(5);
		g(5);

		(function (this: void, n: 5) {
			expect(n).to.equal(5);
		})(5);
		({
			x: function (n: 5) {
				expect(n).to.equal(5);
			},
		}).x(5);

		({
			x: function (this: void, n: 5) {
				expect(n).to.equal(5);
			},
		}).x(5);

		({
			x: function (this: {}, n: 5) {
				expect(n).to.equal(5);
			},
		}).x(5);

		((n: 5) => {
			expect(n).to.equal(5);
		})(5);

		const obj = {
			saferNum: function (this: void, n: number): number {
				return n === n && n > 0 ? n : 0;
			}, // wouldn't compile previously because it is a named function
		};
		const { saferNum } = obj;
		expect(saferNum(5)).to.equal(5);
	});

	it("should optimize array spread paramters", () => {
		function foo(...[a, b, c]: [number, string, boolean]) {
			return [a, b, c];
		}
		const result = foo(123, "abc", true);
		expect(result[0]).to.equal(123);
		expect(result[1]).to.equal("abc");
		expect(result[2]).to.equal(true);
	});

	it("should protect against void values passed into built-in functions", () => {
		function foo() {}
		expect(tonumber(foo())).to.equal(undefined);
	});

	it("should not wrap argument spread expressions in parentheses", () => {
		const args: unknown[] = ["123", "456"];
		expect(select(1, ...args)[1]).to.equal("456");
	});

	it("should support spreading into a macro with optional arguments", () => {
		const array = [1, 2, 3, 4, 5];
		const args = [(value: number, accum: number) => value + accum, 10] as const;
		const sum = array.reduce(...args);
		expect(sum).to.equal(25);
	});
};
