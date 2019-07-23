export = () => {
	it("should destructure simple arrays", () => {
		const [a, b] = [1, 2];
		expect(a).to.equal(1);
		expect(b).to.equal(2);
	});

	it("should destructure nested arrays", () => {
		const [[a, b], [c, d]] = [[7, 2], [8, 9]];
		expect(a).to.equal(7);
		expect(b).to.equal(2);
		expect(c).to.equal(8);
		expect(d).to.equal(9);
	});

	it("should destructure simple objects", () => {
		const a = {
			b: 1,
			c: 2,
			d: 3,
		};
		const { b, c, d } = a;
		expect(b).to.equal(1);
		expect(c).to.equal(2);
		expect(d).to.equal(3);
	});

	it("should destructure nested objects", () => {
		const a = {
			b: {
				c: {
					d: 123,
				},
			},
		};
		const {
			b: {
				c: { d },
			},
		} = a;
		expect(d).to.equal(123);
	});

	it("should destructure mixed objects", () => {
		const a = {
			b: {
				c: [8, 1, 4],
			},
		};

		const {
			b: {
				c: [eight, one, four],
			},
		} = a;

		expect(eight).to.equal(8);
		expect(one).to.equal(1);
		expect(four).to.equal(4);
	});

	it("should support default values", () => {
		const foo = {
			a: {
				b: 1,
			},
		};

		const bar = {
			a: {
				b: undefined,
			},
		};

		{
			const {
				a: { b = 5 },
			} = foo;
			expect(b).to.equal(1);
		}
		{
			const {
				a: { b = 5 },
			} = bar;
			expect(b).to.equal(5);
		}
	});

	it("should support aliases", () => {
		const foo = {
			a: {
				b: 123,
			},
		};

		const {
			a: { b: z },
		} = foo;
		expect(z).to.equal(123);
	});

	it("should not optimize array destructuring", () => {
		function a() {
			return [1, 2, 3];
		}
		const [d, e, f] = a();
		expect(d).to.equal(1);
		expect(e).to.equal(2);
		expect(f).to.equal(3);
	});

	it("should optimize tuple destructuring", () => {
		function a(): [number, number, number] {
			return [1, 2, 3];
		}
		const [d, e, f] = a();
		expect(d).to.equal(1);
		expect(e).to.equal(2);
		expect(f).to.equal(3);
	});

	it("should optimize tuple destructuring with omitted expressions", () => {
		function a(): [number, number, number, number] {
			return [1, 2, 3, 4];
		}
		const [, b, , c] = a();
		expect(b).to.equal(2);
		expect(c).to.equal(4);
	});

	it("should localize varargs if they are destructured in nested functions", () => {
		function b(arg1?: number, arg2?: number): [number, number] {
			return [arg1 || 1, arg2 || 1];
		}
		function a(...args: Array<number>): [number, number] {
			const x = () => {
				return b(...args);
			};
			return x();
		}
		const [c, d] = a(1, 2);
		expect(c).to.equal(1);
		expect(d).to.equal(2);
	});

	it("should support destructure assignment", () => {
		let x: number;
		let y: number;
		let z: number;
		[x, y, [z]] = [1, 2, [3]];
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should support destructure assignment with identifier", () => {
		let x: number;
		let y: number;
		let z: number;
		const obj: [number, number, [number]] = [1, 2, [3]];
		[x, y, [z]] = obj;
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should support destructure assignment as expression", () => {
		function test(obj: [number, number, [number]]) {
			expect(obj[0]).to.equal(1);
			expect(obj[1]).to.equal(2);
			expect(obj[2][0]).to.equal(3);
		}

		let x: number;
		let y: number;
		let z: number;
		test(([x, y, [z]] = [1, 2, [3]]));
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should support destructure assignment with property access", () => {
		const obj = {
			x: 0,
			y: 0,
			z: 0,
		};
		[obj.x, obj.y, [obj.z]] = [1, 2, [3]];
		expect(obj.x).to.equal(1);
		expect(obj.y).to.equal(2);
		expect(obj.z).to.equal(3);
	});

	it("should support indexing a return value from a function", () => {
		function foo(): [number, number, number] {
			return [1, 2, 3];
		}
		function bar() {
			return [4, 5, 6];
		}
		expect(foo()[0]).to.equal(1);
		expect(foo()[1]).to.equal(2);
		expect(foo()[2]).to.equal(3);
		expect(bar()[0]).to.equal(4);
		expect(bar()[1]).to.equal(5);
		expect(bar()[2]).to.equal(6);
	});

	it("should support accessing the size method", () => {
		[1, 2, 3].size();
		expect([1, 2, 3].size()).to.equal(3);
	});

	it("should destructure properly into already declared variables", () => {
		let a: number;
		[a] = new Set([4]);
		expect(a).to.equal(4);

		let len: number;
		({ [2]: len } = [1, 2, 3]);
		expect(len).to.equal(3);

		let y = 0;
		({ x: y } = { x: 1 });
		expect(y).to.equal(1);
	});

	it("should destructure computed property types as well (number-only)", () => {
		const array = new Array<number>();
		array.push(1, 2, 3, 4);

		function f(i: number) {
			let num: number;
			({ [i]: num } = array);
			return num;
		}

		expect(f(0)).to.equal(1);
		expect(f(1)).to.equal(2);
		expect(f(2)).to.equal(3);
		expect(f(3)).to.equal(4);
	});

	it("should destructure into objects", () => {
		const o = {
			a: 100,
			b: 100,
			c: 100,
			d: 100,
			1: 100,

			// tslint:disable
			// prettier-ignore
			"e":100
		};

		const f = (): "6" => "6";

		// tslint:disable
		// prettier-ignore
		({ a: o.a, b: o.b, "9": o.c, 5: o.d, [f()]: o["e"], c: o[1] } = { a: 1, b: 2, c: 3, "9": 4, 5: 5, ["6"]: 6 });

		let i = 0;

		expect(o.a).to.equal(++i);
		expect(o.b).to.equal(++i);
		expect(o[1]).to.equal(++i);
		expect(o.c).to.equal(++i);
		expect(o.d).to.equal(++i);
		expect(o["e"]).to.equal(++i);
	});

	it("should properly destruct objects with a Symbol.iterator method", () => {
		const k = { o: 1, b: 2 };
		const o = {
			o: 3,
			...k,
			b: 4,
			*[Symbol.iterator]() {
				const values = Object.values(this).filter(a => typeIs(a, "number")) as Array<number>;
				for (const value of values) {
					yield value;
				}
			},
		};

		const arr = [...o].filter(i => typeIs(i, "number")) as Array<number>;
		const set1 = new Set(arr);
		const set2 = new Set([1, 4]);

		expect(
			set1
				.difference(set2)
				.union(set2.difference(set1))
				.isEmpty(),
		).to.equal(true);
	});

	it("should properly destructure optimized strings", () => {
		const truth = ["a", "b", "c", "d", "e", "f", "g"];
		expect([..."abcdefg"].every((x, i) => truth[i] === x)).to.equal(true);
	});

	it("should properly destructure optimized strings with a ' as quotes", () => {
		const truth = ["a", "b", "c", '"', "d", "e", "f", "g"];
		expect([...'abc"defg'].every((x, i) => truth[i] === x)).to.equal(true);
	});

	it("should properly destructure optimized strings with backslashes", () => {
		const truth = ["a", "\n", "b", "c", '"', "d", "e", "\t", "f", "\\", "g"];
		expect([...'a\nbc"de\tf\\g'].every((x, i) => truth[i] === x)).to.equal(true);
	});

	it("should properly destructure strings with a ` as quotes", () => {
		const truth = ["'", "a", "b", "c", '"', "d", "e", "f", "g", "'"];
		expect([...`'abc"defg'`].every((x, i) => truth[i] === x)).to.equal(true);
	});

	it("should properly destruct gmatch #1", () => {
		function catchLetters(...letterPairs: Array<LuaTuple<Array<string>>>) {
			let i = 97;
			for (const [a, b] of letterPairs) {
				expect(a).to.equal(string.char(i++));
				expect(b).to.equal(string.char(i++));
			}
		}

		catchLetters(..."abcdefghijklmnopqrstuvwxyz".gmatch("(%l)(%l)"));
	});

	it("should properly destruct gmatch #2", () => {
		const [a, b, c] = "a,b,c".gmatch("[^,]+");
		expect(a).to.equal("a");
		expect(b).to.equal("b");
		expect(c).to.equal("c");
	});

	it("should properly destruct gmatch #3", () => {
		const [, a, b, c] = "z,a,b,c".gmatch("[^,]+");
		expect(a).to.equal("a");
		expect(b).to.equal("b");
		expect(c).to.equal("c");
	});

	it("should properly destruct sets", () => {
		const [a, , c] = new Set([1, 2, 3]);
		expect(a).to.equal(1);
		expect(c).to.equal(3);
	});

	it("should properly destruct maps", () => {
		const [a, , c] = new Map([["a", 1], ["b", 2], ["c", 3]]);
		expect(a[0]).to.equal("a");
		expect(a[1]).to.equal(1);
		expect(c[0]).to.equal("b");
		expect(c[1]).to.equal(2);
	});

	it("should properly destruct with element access", () => {
		const array = [1, 2];
		[array[0], array[1]] = [array[1], array[0]];
		expect(array[0]).to.equal(2);
		expect(array[1]).to.equal(1);
	});

	it("should properly destruct with var element access", () => {
		const array = [1, 2];
		let a = 0;
		let b = 1;
		[array[a], array[b]] = [array[b], array[a]];
		expect(array[a]).to.equal(2);
		expect(array[b]).to.equal(1);
	});

	it("should support initializers in object destructuring", () => {
		const o: { [K: string]: number } = {
			a: 1,
			b: 2,
			c: 3,
		};
		function f(x: string) {
			const { [x]: a = 0 } = o;
			return a;
		}
		function g(x: string) {
			const { x: b = 2 } = o;
			return b;
		}
		expect(f("a")).to.equal(1);
		expect(f("b")).to.equal(2);
		expect(f("c")).to.equal(3);
		expect(f("d")).to.equal(0);
		expect(g("a")).to.equal(2);
		expect(g("d")).to.equal(2);
	});

	it("should support arrays with object destructure", () => {
		const array = [3, 4];
		let a = 0;
		let b = 1;
		({ [a]: array[b], [b]: array[a] } = array);
		expect(array[a]).to.equal(3);
		expect(array[b]).to.equal(3);
	});

	it("should support object destructuring with context", () => {
		let y = 0;
		const { x = y++ } = { x: undefined };
		expect(x).to.equal(0);
		expect(y).to.equal(1);
	});

	it("should support object destructing from object with shorthand syntax", () => {
		let x = 123;
		const { x: y } = { x };
		expect(y).to.equal(123);
	});

	it("should support object destructing from object with numeric literal key", () => {
		let x = 456;
		const { 1: y } = { 1: x };
		expect(y).to.equal(456);
	});

	it("should support object destructing from object with string literal key", () => {
		let x = 789;
		// prettier-ignore
		const { "str": y } = { "str": x };
		expect(y).to.equal(789);
	});

	it("should support destructuring from strings", () => {
		const str = "xyz";
		const [a, b, c] = str;
		expect(a).to.equal("x");
		expect(b).to.equal("y");
		expect(c).to.equal("z");
	});

	it("should support destructuring from string literals", () => {
		const [a, b, c] = "xyz";
		expect(a).to.equal("x");
		expect(b).to.equal("y");
		expect(c).to.equal("z");
	});

	it("should support object assignment destructuring", () => {
		let a = 0;
		let b = 0;
		let c = 0;
		({ a, b, c } = { a: 4, b: 5, c: 6 });
		expect(a).to.equal(4);
		expect(b).to.equal(5);
		expect(c).to.equal(6);
	});

	it("should support object assignment destructuring with aliases", () => {
		let a = 0;
		let b = 0;
		let c = 0;
		({ x: a, y: b, z: c } = { x: 4, y: 5, z: 6 });
		expect(a).to.equal(4);
		expect(b).to.equal(5);
		expect(c).to.equal(6);
	});

	it("should support nested object assignment destructuring", () => {
		const obj = {
			a: {
				b: {
					c: {
						d: "NEST!",
					},
				},
			},
		};
		let d = "";
		({
			a: {
				b: {
					c: { d },
				},
			},
		} = obj);
		expect(d).to.equal("NEST!");
	});

	it("should support nested object assignment destructuring with alias", () => {
		const obj = {
			a: {
				b: {
					c: {
						d: "NEST!",
					},
				},
			},
		};
		let str = "";
		({
			a: {
				b: {
					c: { d: str },
				},
			},
		} = obj);
		expect(str).to.equal("NEST!");
	});

	it("should support array binding pattern with initializer", () => {
		const [x = 5] = [];
		expect(x).to.equal(5);
	});

	it("should support array binding literal with omitted expression", () => {
		let a = 0;
		let b = 0;
		[a, , b] = [1, 2, 3];
		expect(a).to.equal(1);
		expect(b).to.equal(3);
	});
};
