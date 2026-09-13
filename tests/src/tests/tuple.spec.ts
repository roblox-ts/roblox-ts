export = () => {
	it("should discard tuple results in for clauses and void expressions", () => {
		let calls = 0;
		function values() {
			return $tuple(++calls, "value");
		}
		for (values(); calls < 3; values()) {
			expect(calls < 3).to.equal(true);
		}
		const ignored = void values();

		expect(calls).to.equal(4);
		expect(ignored).to.equal(undefined);
	});

	it("should support numeric separators in tuple return indices", () => {
		function values(): LuaTuple<[number, number]> {
			return $tuple(123, 456);
		}
		expect(values()[0x0_0]).to.equal(123);
		expect(values()[0x0_1]).to.equal(456);
	});

	it("should unpack function return tuples", () => {
		function foo(): [number, number] {
			return [101, 203];
		}
		const [a, b] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(203);

		const c = foo();
		expect(c[0]).to.equal(101);
		expect(c[1]).to.equal(203);

		expect(foo()[0]).to.equal(101);
		expect(foo()[1]).to.equal(203);
	});

	it("should support forwarding and wrapping tuple returns", () => {
		function foo(): [number, string] {
			return [1, "2"];
		}

		function bar() {
			return foo();
		}

		const [a, b] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");

		function wrapped(): [[number, string], boolean] {
			return [foo(), true];
		}

		const [[wrappedA, wrappedB], c] = wrapped();
		expect(wrappedA).to.equal(1);
		expect(wrappedB).to.equal("2");
		expect(c).to.equal(true);
	});

	it("should support function calls with tuple returns as expression statements", () => {
		let itWorked = false;
		function foo(): [number, string] {
			itWorked = true;
			return [1, "2"];
		}
		foo();
		expect(itWorked).to.equal(true);
	});

	it("should support indirect tuple returns and array methods", () => {
		function foo(): [number, number, number] {
			const result: [number, number, number] = [1, 2, 3];
			return result;
		}
		const [x, y, z] = foo();
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
		expect(foo().pop()).to.equal(3);
	});

	it("should unpack and assign function return tuples with LuaTuple<T>", () => {
		function foo(): LuaTuple<[number, number]> {
			return [101, 203] as LuaTuple<[number, number]>;
		}
		const [a, b] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(203);

		const c = foo();
		expect(c[0]).to.equal(101);
		expect(c[1]).to.equal(203);

		expect(foo()[0]).to.equal(101);
		expect(foo()[1]).to.equal(203);

		let x = 0;
		let y = 0;
		[x, y] = foo();
		expect(x).to.equal(101);
		expect(y).to.equal(203);
	});

	it("should support forwarding and wrapping tuple returns with LuaTuple<T>", () => {
		function foo(): LuaTuple<[number, string]> {
			return [1, "2"] as LuaTuple<[number, string]>;
		}

		function bar() {
			return foo();
		}

		const [a, b] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");

		function wrapped(): LuaTuple<[[number, string], boolean]> {
			return [foo(), true] as unknown as LuaTuple<[[number, string], boolean]>;
		}

		const [[wrappedA, wrappedB], c] = wrapped();
		expect(wrappedA).to.equal(1);
		expect(wrappedB).to.equal("2");
		expect(c).to.equal(true);
	});

	it("should support function calls with tuple returns as expression statements with LuaTuple<T>", () => {
		let itWorked = false;
		function foo(): LuaTuple<[number, string]> {
			itWorked = true;
			return [1, "2"] as LuaTuple<[number, string]>;
		}
		foo();
		expect(itWorked).to.equal(true);
	});

	it("should support indirect tuple returns and array methods with LuaTuple<T>", () => {
		function foo(): LuaTuple<[number, number, number]> {
			const result: [number, number, number] = [1, 2, 3];
			return result as LuaTuple<[number, number, number]>;
		}
		const [x, y, z] = foo();
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
		expect(foo().pop()).to.equal(3);
	});

	it("should allow LuaTuples to have Array<> inside", () => {
		function foo(): LuaTuple<[number, number, ...Array<string>] | []> {
			return [1, 2, "3"] as unknown as LuaTuple<[number, number, ...Array<string>] | []>;
		}

		expect(foo().pop()).to.equal("3");
	});

	it("should support assigning from LuaTuples with omitted expressions", () => {
		function foo(): LuaTuple<[number, number, number]> {
			return [101, 203, 345] as LuaTuple<[number, number, number]>;
		}

		let a = 0;
		let b = 0;
		[a, , b] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(345);
	});

	it("should support nested assigning from LuaTuples", () => {
		function foo(): LuaTuple<[number, [number, number]]> {
			return [101, [203, 345]] as LuaTuple<[number, [number, number]]>;
		}

		let a = 0;
		let b = 0;
		[a, [, b]] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(345);
	});

	it("should keep nested rest within one LuaTuple value", () => {
		let calls = 0;
		function values(): LuaTuple<[Array<number>, number]> {
			calls++;
			return $tuple([1, 2, 3], 4);
		}

		const [[first, ...rest], last] = values();
		expect(first).to.equal(1);
		expect(rest.size()).to.equal(2);
		expect(rest[0]).to.equal(2);
		expect(rest[1]).to.equal(3);
		expect(last).to.equal(4);
		expect(calls).to.equal(1);

		let assignedFirst = 0;
		let assignedRest = new Array<number>();
		let assignedLast = 0;
		[[assignedFirst, ...assignedRest], assignedLast] = values();
		expect(assignedFirst).to.equal(1);
		expect(assignedRest.size()).to.equal(2);
		expect(assignedRest[0]).to.equal(2);
		expect(assignedRest[1]).to.equal(3);
		expect(assignedLast).to.equal(4);
		expect(calls).to.equal(2);
	});

	it("should support nested assigning from LuaTuples 2", () => {
		function foo(): LuaTuple<[number, { a: number; b: number }]> {
			return [101, { a: 203, b: 345 }] as LuaTuple<[number, { a: number; b: number }]>;
		}

		let a = 0;
		let b = 0;
		[a, { b }] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(345);
	});

	it("should wrap LuaTuple returns in for loop conditions", () => {
		function luaTupleReturn() {
			return [false] as LuaTuple<[boolean]>;
		}

		let hasRun1 = false;
		for (; luaTupleReturn(); ) {
			hasRun1 = true;
			break;
		}
		expect(hasRun1).to.equal(true);
	});

	it("should support indexing nullable LuaTuple elements", () => {
		function foo(): LuaTuple<[number, string]> | undefined {
			return [1, "2"] as LuaTuple<[number, string]>;
		}

		function bar(): LuaTuple<[number, string]> | undefined {
			return undefined;
		}

		function fnTuple(): LuaTuple<[number, () => LuaTuple<[string, () => number]>]> | undefined {
			return $tuple(1, () => $tuple("2", () => 3));
		}

		expect(foo()?.[1]).to.equal("2");
		expect(bar()?.[1]).to.equal(undefined);
		expect(fnTuple()?.[1]?.()?.[0]).to.equal("2");
		expect(fnTuple()?.[1]?.()?.[1]?.()).to.equal(3);

		expect(foo?.()?.[1]).to.equal("2");
		expect(bar?.()?.[1]).to.equal(undefined);
		expect(fnTuple?.()?.[1]?.()?.[0]).to.equal("2");
		expect(fnTuple?.()?.[1]?.()?.[1]?.()).to.equal(3);
	});

	it("should preserve $tuple values through indexing, destructuring, and nested calls", () => {
		function luaTupleMacroReturn() {
			return $tuple(123, "abc", true);
		}

		function wrapperFunction() {
			return luaTupleMacroReturn();
		}

		const tuple = luaTupleMacroReturn();

		expect(tuple[0]).to.equal(123);
		expect(tuple[1]).to.equal("abc");
		expect(tuple[2]).to.equal(true);

		const [a, b, c] = luaTupleMacroReturn();
		expect(a).to.equal(123);
		expect(b).to.equal("abc");
		expect(c).to.equal(true);

		const [wrappedA, wrappedB, wrappedC] = wrapperFunction();
		expect(wrappedA).to.equal(123);
		expect(wrappedB).to.equal("abc");
		expect(wrappedC).to.equal(true);
	});

	it("should support $tuple macro with type assertion", () => {
		function test() {
			return $tuple(1) as LuaTuple<[number]>;
		}
		const [value] = test();
		expect(value).to.equal(1);
		expect(test()[0]).to.equal(1);
	});
};
