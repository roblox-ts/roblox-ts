/* eslint-disable prefer-const */

function makePair(first: number, second: number) {
	return $tuple(first, second);
}

export = () => {
	it("should evaluate empty destructuring initializers exactly once", () => {
		let calls = 0;
		function value() {
			calls++;
			return 42;
		}
		const [] = [];
		const [] = [value()];
		const {} = {};
		expect(calls).to.equal(1);
	});

	it("should assign a nested object without a default initializer", () => {
		let value = 0;
		function read() {
			return [{ value: 42 }];
		}
		[{ value }] = read();
		expect(value).to.equal(42);
	});

	it("should stop advancing short scalar iterators before collecting rest bindings", () => {
		for (const length of [0, 1, 2, 3, 5]) {
			let calls = 0;
			const iterator = (() => {
				calls++;
				assert(calls <= length + 1, "advanced after exhaustion");
				return calls <= length ? calls : undefined;
			}) as IterableFunction<number>;

			const [first = 10, second = 20, , ...rest] = iterator;

			expect(first).to.equal(length >= 1 ? 1 : 10);
			expect(second).to.equal(length >= 2 ? 2 : 20);
			expect(rest.join(",")).to.equal(length === 5 ? "4,5" : "");
			expect(calls).to.equal(length + 1);
		}
	});

	it("should remember exhaustion in an omitted first iterator binding", () => {
		let calls = 0;
		const iterator = (() => {
			calls++;
			assert(calls === 1, "advanced after exhaustion");
			return undefined as number | undefined;
		}) as IterableFunction<number>;

		const [, , value = 42, ...rest] = iterator;

		expect(value).to.equal(42);
		expect(rest.size()).to.equal(0);
		expect(calls).to.equal(1);
	});

	it("should evaluate assignment targets and defaults after iterator exhaustion", () => {
		const events = new Array<string>();
		const target = { first: 0, second: 0, rest: new Array<number>() };
		let calls = 0;
		const iterator = (() => {
			events.push("next");
			calls++;
			assert(calls === 1, "advanced after exhaustion");
			return undefined as number | undefined;
		}) as IterableFunction<number>;
		function getTarget(name: string) {
			events.push(name);
			return target;
		}
		function initialize(name: string) {
			events.push(`default:${name}`);
			return 42;
		}

		[
			getTarget("first").first = initialize("first"),
			,
			getTarget("second").second = initialize("second"),
			...getTarget("rest").rest
		] = iterator;

		expect(events.join(",")).to.equal("first,next,default:first,second,default:second,rest");
		expect(target.first).to.equal(42);
		expect(target.second).to.equal(42);
		expect(target.rest.size()).to.equal(0);
		expect(calls).to.equal(1);
	});

	it("should stop short tuple iterators even when their trailing returns are populated", () => {
		for (const length of [0, 1, 2, 3, 5]) {
			let calls = 0;
			const iterator = (() => {
				calls++;
				assert(calls <= length + 1, "advanced after exhaustion");
				return $tuple(calls <= length ? calls : undefined, 99);
			}) as IterableFunction<LuaTuple<[number, number]>>;

			const [first = makePair(10, 11), second = makePair(20, 21), , ...rest] = iterator;

			expect(first[0]).to.equal(length >= 1 ? 1 : 10);
			expect(first[1]).to.equal(length >= 1 ? 99 : 11);
			expect(second[0]).to.equal(length >= 2 ? 2 : 20);
			expect(rest.size()).to.equal(length === 5 ? 2 : 0);
			expect(calls).to.equal(length + 1);
		}
	});

	it("should preserve tuple assignment defaults after an omitted element exhausts the iterator", () => {
		let calls = 0;
		const iterator = (() => {
			calls++;
			assert(calls === 1, "advanced after exhaustion");
			return $tuple(undefined as number | undefined, 99);
		}) as IterableFunction<LuaTuple<[number, number]>>;
		let value: LuaTuple<[number, number]>;
		let rest: Array<LuaTuple<[number, number]>>;

		[, value = makePair(42, 43), , ...rest] = iterator;

		expect(value[0]).to.equal(42);
		expect(value[1]).to.equal(43);
		expect(rest.size()).to.equal(0);
		expect(calls).to.equal(1);
	});

	it("should collect the remaining values from iterator functions", () => {
		let calls = 0;
		const iterator = (() => {
			calls++;
			return calls <= 4 ? calls : undefined;
		}) as IterableFunction<number>;
		const [first, , ...rest] = iterator;

		expect(first).to.equal(1);
		expect(rest.join(",")).to.equal("3,4");
		expect(calls).to.equal(5);
	});

	it("should retain the iterator when advancing it rebinds its source", () => {
		let calls = 0;
		let iterator: IterableFunction<number>;
		iterator = (() => {
			calls++;
			iterator = ((): number => {
				throw "replacement iterator must not be called";
			}) as IterableFunction<number>;
			return calls <= 3 ? calls : undefined;
		}) as IterableFunction<number>;

		const [first, second, ...rest] = iterator;

		expect(first).to.equal(1);
		expect(second).to.equal(2);
		expect(rest.join(",")).to.equal("3");
		expect(calls).to.equal(4);
	});

	it("should retain the iterator when a nested default rebinds its source", () => {
		let calls = 0;
		const original = (() => {
			calls++;
			return $tuple(calls <= 3 ? calls : undefined, undefined);
		}) as IterableFunction<LuaTuple<[number, number?]>>;
		const replacement = ((): LuaTuple<[number, number?]> => {
			throw "replacement iterator must not be called";
		}) as IterableFunction<LuaTuple<[number, number?]>>;
		let iterator = original;

		const [[first, value = ((iterator = replacement), 99)], second, ...rest] = iterator;

		expect(first).to.equal(1);
		expect(value).to.equal(99);
		expect(second[0]).to.equal(2);
		expect(rest[0][0]).to.equal(3);
		expect(rest.size()).to.equal(1);
		expect(calls).to.equal(4);
		expect(iterator).to.equal(replacement);
	});

	it("should evaluate a rest assignment target before consuming its iterator", () => {
		let calls = 0;
		const events = new Array<string>();
		const original = new Array<Array<number>>();
		const replacement = new Array<Array<number>>();
		let target = original;
		const iterator = (() => {
			events.push("next");
			target = replacement;
			return ++calls <= 2 ? calls : undefined;
		}) as IterableFunction<number>;
		function key() {
			events.push("key");
			return 0;
		}

		[...target[key()]] = iterator;

		expect(events.join(",")).to.equal("key,next,next,next");
		expect(original[0].join(",")).to.equal("1,2");
		expect(replacement.size()).to.equal(0);
	});

	it("should collect remaining tuples from iterator functions", () => {
		const [[first], , ...rest] = "a,b,c,d".gmatch("[^,]+");

		expect(first).to.equal("a");
		expect(rest.size()).to.equal(2);
		expect(rest[0][0]).to.equal("c");
		expect(rest[1][0]).to.equal("d");

		let head: LuaTuple<Array<string | number>>;
		let tail: Array<LuaTuple<Array<string | number>>>;
		[head, ...tail] = "e,f,g".gmatch("[^,]+");

		expect(head[0]).to.equal("e");
		expect(tail.size()).to.equal(2);
		expect(tail[0][0]).to.equal("f");
		expect(tail[1][0]).to.equal("g");
	});

	it("should stop tuple iterator rest bindings at the first nil return", () => {
		const values = [false, 0] as const;
		let calls = 0;
		const iterator = (() => {
			calls++;
			assert(calls <= 3, "iterator was called after its first return became nil");
			return $tuple(calls <= 2 ? values[calls - 1] : undefined, calls * 10);
		}) as IterableFunction<LuaTuple<[boolean | number | undefined, number]>>;

		const [first, ...rest] = iterator;

		expect(first[0]).to.equal(false);
		expect(rest.size()).to.equal(1);
		expect(rest[0][0]).to.equal(0);
		expect(rest[0][1]).to.equal(20);
		expect(calls).to.equal(3);
	});

	it("should destructure simple arrays", () => {
		const [a, b] = [1, 2];
		expect(a).to.equal(1);
		expect(b).to.equal(2);
	});

	it("should spread destructure arrays", () => {
		const [a, ...b] = [1, 2, 3];
		expect(a).to.equal(1);
		expect(b[0]).to.equal(2);
		expect(b[1]).to.equal(3);
	});

	it("should destructure nested arrays", () => {
		const [[a, b], [c, d]] = [
			[7, 2],
			[8, 9],
		];
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

	it("should spread destructure objects", () => {
		const a = {
			b: 1,
			c: 2,
			d: 3,
		};
		const { b, ...rest } = a;
		expect(b).to.equal(1);
		expect(rest.c).to.be.equal(2);
		expect(rest.d).to.be.equal(3);
	});

	it("should support rest in assignment patterns", () => {
		const obj = {
			a: 1,
			b: 2,
			c: 3,
		};

		let a: number, b: number, rest: { c: number };
		({ a, b, ...rest } = obj);

		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(rest.c).to.equal(3);
	});

	it("should disregard array optimizations if contains spread", () => {
		const [a, b, ...[...[c]]] = [1, 2, [1, 2]];
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c[0]).to.equal(1);
	});

	it("should support spread destructure in nested binding patterns", () => {
		const foo = {
			a: 1,
			b: [1, 2, 3, 4],
			c: {
				d: 2,
				e: 3,
				f: 4,
			},
		};

		const {
			a,
			b: [e1, e2, ...arrRest],
			c: { d, ...rest },
		} = foo;
		expect(e1).to.be.equal(1);
		expect(e2).to.be.equal(2);
		expect(arrRest[0]).to.be.equal(3);
		expect(arrRest[1]).to.be.equal(4);

		expect(a).to.equal(1);
		expect(d).to.equal(2);
		expect(rest.e).to.equal(3);
		expect(rest.f).to.equal(4);
	});

	it("should spread destructure objects with computed index exps", () => {
		const a = {
			b: 1,
			c: 2,
			d: 3,
		};
		const key = "b";
		const { [key]: b, ...rest } = a;
		expect(b).to.equal(1);
		expect(rest.c).to.be.equal(2);
		expect(rest.d).to.be.equal(3);
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

	it("should not save variable changes made inside object binding elements", () => {
		let notok = { foo: true, bar: false };
		let ok = {
			foo: undefined as boolean | undefined,
			bar: true,
		};
		const { foo = (ok = notok).foo, bar } = ok;

		expect(ok.foo).to.equal(true);
		expect(foo).to.equal(true);
		expect(bar).to.equal(true);
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

	it("should support destructure assignment", () => {
		let x: number;
		let y: number;
		let z: number;
		[x, y, [z]] = [1, 2, [3]];
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should support rest in destructure assignment", () => {
		let x: number;
		let y: number;
		let z: number[];
		[x, y, ...z] = [1, 2, 3, 4];
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z[0]).to.equal(3);
		expect(z[1]).to.equal(4);
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

	it("should support nested object destructure assignment with length property", () => {
		let length: number;

		// prettier-ignore
		([{ length }] = [{ length: 42 }] as const);

		expect(length).to.equal(42);
	});

	it("should support length properties on generic objects", () => {
		function readLength<T extends { length: number }>(value: T) {
			const { length } = value;

			expect(value.length).to.equal(length);
			expect(value["length"]).to.equal(length);
			return length;
		}

		expect(readLength({ length: 42 })).to.equal(42);
	});

	it("should support length properties on generic object intersections", () => {
		function readLength<T extends { tag: string }>(value: T & { length: number }) {
			const { length } = value;

			expect(value.length).to.equal(length);
			expect(value["length"]).to.equal(length);
			return length;
		}

		expect(readLength({ length: 42, tag: "object" })).to.equal(42);
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

	it("should not save variable changes made inside array binding elements", () => {
		let notok = [true, false];
		let ok = [undefined, true];
		const [foo = (ok = notok)[0], bar] = ok;

		expect(ok[0]).to.equal(true);
		expect(foo).to.equal(true);
		expect(bar).to.equal(true);
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

			// prettier-ignore
			"e":100,
		};

		const f = (): "6" => "6";

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
		function catchLetters(...letterPairs: Array<LuaTuple<Array<string | number>>>) {
			let i = 97;
			for (const [a, b] of letterPairs) {
				expect(a).to.equal(string.char(i++));
				expect(b).to.equal(string.char(i++));
			}
		}

		catchLetters(..."abcdefghijklmnopqrstuvwxyz".gmatch("(%l)(%l)"));
	});

	it("should properly destruct gmatch #2", () => {
		const [[a], [b], [c]] = "a,b,c".gmatch("[^,]+");
		expect(a).to.equal("a");
		expect(b).to.equal("b");
		expect(c).to.equal("c");
	});

	it("should properly destruct gmatch #3", () => {
		const [, [a], [b], [c]] = "z,a,b,c".gmatch("[^,]+");
		expect(a).to.equal("a");
		expect(b).to.equal("b");
		expect(c).to.equal("c");
	});

	it("should properly destruct sets", () => {
		const expected = new Set([1, 2, 3]);
		const [a, b, c] = new Set([1, 2, 3]);
		expect(expected.delete(a)).to.equal(true);
		expect(expected.delete(b)).to.equal(true);
		expect(expected.delete(c)).to.equal(true);
	});

	it("should spread destructure sets", () => {
		const [a, ...rest] = new Set([1, 2, 3]);
		expect(rest.size()).to.equal(2);
		expect(rest.includes(a)).to.equal(false);
	});

	it("should properly destruct maps", () => {
		const expected = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);

		const [a, b, c] = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);

		expect(expected.get(a[0])).to.equal(a[1]);
		expect(expected.delete(a[0])).to.equal(true);

		expect(expected.get(b[0])).to.equal(b[1]);
		expect(expected.delete(b[0])).to.equal(true);

		expect(expected.get(c[0])).to.equal(c[1]);
		expect(expected.delete(c[0])).to.equal(true);
	});

	it("should spread destructure maps", () => {
		const expected = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);

		const [a, ...rest] = new Map([
			["a", 1],
			["b", 2],
			["c", 3],
		]);

		expect(expected.get(a[0])).to.equal(a[1]);
		expect(expected.delete(a[0])).to.equal(true);

		expect(expected.get(rest[0][0])).to.equal(rest[0][1]);
		expect(expected.delete(rest[0][0])).to.equal(true);

		expect(expected.get(rest[1][0])).to.equal(rest[1][1]);
		expect(expected.delete(rest[1][0])).to.equal(true);

		expect(expected.size()).to.equal(0);
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

	it("should support rest in object assignment destructuring", () => {
		let a: number, b: number, c: { c: number; d: number };
		({ a, b, ...c } = { a: 1, b: 2, c: 3, d: 4 });
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c.c).to.equal(3);
		expect(c.d).to.equal(4);
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

	it("should support array binding literal with initializer", () => {
		let a = 0;
		let b = 0;
		[a = 5, b = 6] = [];
		expect(a).to.equal(5);
		expect(b).to.equal(6);
	});

	it("should support object binding literal with initializer", () => {
		let a = 0;
		let b = 0;
		({ a = 5, b = 6 } = {});
		expect(a).to.equal(5);
		expect(b).to.equal(6);
	});

	it("should support object binding literal with alias and initializer", () => {
		let y = 0;
		({ x: y = 5 } = {});
		expect(y).to.equal(5);
	});

	it("should destructure assign with nested sets", () => {
		let a = "";
		const obj = {
			x: new Set(["heck"]),
		};
		({
			x: [a],
		} = obj);
		expect(a).to.equal("heck");
	});

	it("should destructure assign with nested maps", () => {
		let a: [string, number];
		const obj = {
			x: new Map([["heck", 123]]),
		};
		({
			x: [a],
		} = obj);
		expect(a[0]).to.equal("heck");
		expect(a[1]).to.equal(123);
	});

	it("should destructure assign with nested maps keys and values", () => {
		let a: string;
		let b: number;
		const obj = {
			x: new Map([["heck", 123]]),
		};
		({
			x: [[a, b]],
		} = obj);
		expect(a).to.equal("heck");
		expect(b).to.equal(123);
	});

	it("should destructure assign with double nested maps keys and values", () => {
		let a: string;
		let b: number;
		const obj = {
			x: [new Map([["heck", 123]])],
		};
		({
			x: [[[a, b]]],
		} = obj);
		expect(a).to.equal("heck");
		expect(b).to.equal(123);
	});

	it("should destructure assign with double nested sets", () => {
		let a: string;
		const obj = {
			x: [new Set(["heck"])],
		};
		({
			x: [[a]],
		} = obj);
		expect(a).to.equal("heck");
	});

	it("should destructure assign with triple nested sets", () => {
		let a: string;
		const obj = {
			x: [new Set(["heck"])],
		};
		({
			x: [[[a]]],
		} = obj);
		expect(a).to.equal("h");
	});

	function* generatorValues() {
		yield 1;
		yield 2;
		yield 3;
	}

	it("should destructure nested generators", () => {
		const obj = {
			x: generatorValues(),
		};
		let a = 0;
		let b = 0;
		let c = 0;
		({
			x: [a, b, c],
		} = obj);
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
	});

	it("should spread destructure generators", () => {
		const [a, ...rest] = generatorValues();
		expect(a).to.equal(1);
		expect(rest.size()).to.equal(2);
		expect(rest[0]).to.equal(2);
		expect(rest[1]).to.equal(3);
	});

	it("should destructure double nested generators", () => {
		const obj = {
			x: [generatorValues()],
		};
		let a = 0;
		let b = 0;
		let c = 0;
		({
			x: [[a, b, c]],
		} = obj);
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
	});

	it("should destructure nested strings", () => {
		const obj = {
			x: "abc",
		};
		let a = "";
		let b = "";
		let c = "";
		({
			x: [a, b, c],
		} = obj);
		expect(a).to.equal("a");
		expect(b).to.equal("b");
		expect(c).to.equal("c");
	});

	it("should destructure nested strings 2", () => {
		const obj = {
			x: new Map([["foo", 1]]),
		};

		let a = "";

		({
			x: [[[[[a]]]]],
		} = obj);

		expect(a).to.equal("f");
	});

	it("should spread destructure strings", () => {
		const [h, e, ...llo] = "hello";

		expect(h).to.equal("h");
		expect(e).to.equal("e");
		expect(llo.join("")).to.equal("llo");

		const [...fruits] = "🍓a🍉b🥝c";
		expect(fruits[0]).to.equal("🍓");
		expect(fruits[1]).to.equal("a");
		expect(fruits[2]).to.equal("🍉");
		expect(fruits[3]).to.equal("b");
		expect(fruits[4]).to.equal("🥝");
		expect(fruits[5]).to.equal("c");
	});

	it("should preserve omitted string bindings before rest", () => {
		const [, second, , ...rest] = "a🍓bc";

		expect(second).to.equal("🍓");
		expect(rest.size()).to.equal(1);
		expect(rest[0]).to.equal("c");
	});

	it("should preserve exhausted string bindings and defaults before rest", () => {
		const [first, second = "fallback", ...rest] = "a";
		const [empty = "empty", ...emptyRest] = "";
		const [...onlyRest] = "";

		expect(first).to.equal("a");
		expect(second).to.equal("fallback");
		expect(rest.size()).to.equal(0);
		expect(empty).to.equal("empty");
		expect(emptyRest.size()).to.equal(0);
		expect(onlyRest.size()).to.equal(0);
	});

	it("should share a string iterator during rest assignment", () => {
		let first = "";
		let rest = new Array<string>();

		[first, , ...rest] = "a🍓bc";

		expect(first).to.equal("a");
		expect(rest.join("")).to.equal("bc");
	});

	it("should keep separate string iterators for nested rest bindings", () => {
		const [[first, ...inner], ...outer] = "🍓ab";

		expect(first).to.equal("🍓");
		expect(inner.size()).to.equal(0);
		expect(outer.join("")).to.equal("ab");
	});

	it("should initialize a string rest iterator once per loop iteration", () => {
		const heads = new Array<string>();
		const tails = new Array<string>();

		for (const [first, ...rest] of ["abc", "def"]) {
			heads.push(first);
			tails.push(rest.join(""));
		}

		expect(heads.join("")).to.equal("ad");
		expect(tails.join("")).to.equal("bcef");
	});

	it("should get sub type of iterable iterator", () => {
		function* foo() {
			yield "abc";
		}

		const obj = {
			x: foo(),
		};

		let a = "";
		let b = "";
		let c = "";

		({
			x: [[a, b, c]],
		} = obj);

		expect(a).to.equal("a");
		expect(b).to.equal("b");
		expect(c).to.equal("c");
	});

	it("should support empty destructure", () => {
		let x = 0;
		const [] = pcall(() => (x = 123));
		expect(x).to.equal(123);
	});

	it("should support empty destructure assignment", () => {
		let x = 0;
		[] = pcall(() => (x = 123));
		expect(x).to.equal(123);

		[] = [];
		({} = {});
		const array = [1];
		const object = { value: 2 };
		expect(([] = array)).to.equal(array);
		expect(({} = object)).to.equal(object);
		({} = pcall(() => x++));
		expect(x).to.equal(124);
	});

	it("should support function destructuring if not a method", () => {
		let x = 0;
		const a = {
			b: (param: number) => {
				x = param;
			},
		};
		const { b } = a;
		b(123);
		expect(x).to.equal(123);
	});

	function returnsLuaTuple() {
		return $tuple(1, 2, 3, 4, 5);
	}

	it("should support array binding pattern with LuaTuple with spread", () => {
		const [a, b, c, ...rest] = returnsLuaTuple();
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
		expect(rest[0]).to.equal(4);
		expect(rest[1]).to.equal(5);
	});

	it("should support array assignment pattern with LuaTuple with spread", () => {
		let a: number;
		let b: number;
		let c: number;
		let rest: Array<number>;
		[a, b, c, ...rest] = returnsLuaTuple();
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
		expect(rest[0]).to.equal(4);
		expect(rest[1]).to.equal(5);
	});

	it("should support array binding pattern with LuaTuple with optional call", () => {
		const [a, b, c] = returnsLuaTuple?.();
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
	});

	it("should support array assignment pattern with LuaTuple with optional call", () => {
		let a: number;
		let b: number;
		let c: number;
		[a, b, c] = returnsLuaTuple?.();
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
	});
};
