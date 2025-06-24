export = () => {
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

	it("should support wrapping function results", () => {
		function foo() {
			return [1, 2, 3];
		}
		expect(foo()[0]).to.equal(1);
		expect(foo()[1]).to.equal(2);
		expect(foo()[2]).to.equal(3);
	});

	it("should support functions returning tuple calls", () => {
		function foo(): [number, string] {
			return [1, "2"];
		}

		function bar() {
			return foo();
		}

		const [a, b] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");
	});

	it("should support wrapping tuple returns in tuple", () => {
		function foo(): [number, string] {
			return [1, "2"];
		}

		function bar(): [[number, string], boolean] {
			return [foo(), true];
		}

		const [[a, b], c] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");
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

	it("should support indirect tuple returns", () => {
		function foo(): [number, number, number] {
			const result: [number, number, number] = [1, 2, 3];
			return result;
		}
		const [x, y, z] = foo();
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should allow tuples access to array functions", () => {
		function foo(): [number, number, number] {
			const result: [number, number, number] = [1, 2, 3];
			return result;
		}

		expect(foo().pop()).to.equal(3);
	});

	it("should unpack function return tuples with LuaTuple<T>", () => {
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
	});

	it("should support functions returning tuple calls with LuaTuple<T>", () => {
		function foo(): LuaTuple<[number, string]> {
			return [1, "2"] as LuaTuple<[number, string]>;
		}

		function bar() {
			return foo();
		}

		const [a, b] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");
	});

	it("should support wrapping tuple returns in tuple with LuaTuple<T>", () => {
		function foo(): LuaTuple<[number, string]> {
			return [1, "2"] as LuaTuple<[number, string]>;
		}

		function bar(): LuaTuple<[[number, string], boolean]> {
			return [foo(), true] as unknown as LuaTuple<[[number, string], boolean]>;
		}

		const [[a, b], c] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");
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

	it("should support indirect tuple returns with LuaTuple<T>", () => {
		function foo(): LuaTuple<[number, number, number]> {
			const result: [number, number, number] = [1, 2, 3];
			return result as LuaTuple<[number, number, number]>;
		}
		const [x, y, z] = foo();
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should allow tuples access to array functions with LuaTuple<T>", () => {
		function foo(): LuaTuple<[number, number, number]> {
			const result: [number, number, number] = [1, 2, 3];
			return result as LuaTuple<[number, number, number]>;
		}

		expect(foo().pop()).to.equal(3);
	});

	it("should allow LuaTuples to have Array<> inside", () => {
		function foo(): LuaTuple<[number, number, ...Array<string>] | []> {
			return [1, 2, "3"] as unknown as LuaTuple<[number, number, ...Array<string>] | []>;
		}

		expect(foo().pop()).to.equal("3");
	});

	it("should support assigning from LuaTuples", () => {
		function foo(): LuaTuple<[number, number]> {
			return [101, 203] as LuaTuple<[number, number]>;
		}

		let a = 0;
		let b = 0;
		[a, b] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(203);
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

	it("should support $tuple macro", () => {
		function luaTupleMacroReturn() {
			return $tuple(123, "abc", true);
		}

		const tuple = luaTupleMacroReturn();

		expect(tuple[0]).to.equal(123);
		expect(tuple[1]).to.equal("abc");
		expect(tuple[2]).to.equal(true);
	});

	it("should support $tuple macro with destructuring", () => {
		function luaTupleMacroReturn() {
			return $tuple(123, "abc", true);
		}

		const [a, b, c] = luaTupleMacroReturn();

		expect(a).to.equal(123);
		expect(b).to.equal("abc");
		expect(c).to.equal(true);
	});

	it("should support $tuple macro in nested calls", () => {
		function luaTupleMacroReturn() {
			return $tuple(123, "abc", true);
		}

		function wrapperFunction() {
			return luaTupleMacroReturn();
		}

		const [a, b, c] = wrapperFunction();

		expect(a).to.equal(123);
		expect(b).to.equal("abc");
		expect(c).to.equal(true);
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
