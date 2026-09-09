export = () => {
	it("should keep else-if and return prerequisites conditional", () => {
		const values = [1, 2, 3];
		function read(enabled: boolean) {
			if (enabled) {
				return 0;
			} else if (values.pop() === 3) {
				return values.pop();
			}
			return values.pop();
		}

		expect(read(true)).to.equal(0);
		expect(values.join(",")).to.equal("1,2,3");
		expect(read(false)).to.equal(2);
		expect(values.join(",")).to.equal("1");
		expect(read(false)).to.equal(undefined);
		expect(values.size()).to.equal(0);
	});

	it("should evaluate tuple return and throw prerequisites before finally", () => {
		const values = [1, 2, 3, 4];
		const failure = { message: "failed" };
		const failures = [failure];
		const remaining = new Array<number>();
		function read(enabled: boolean) {
			try {
				if (enabled) {
					return $tuple(values.pop(), values.pop());
				}
				throw failures.pop();
			} catch (error) {
				expect(error).to.equal(failure);
				return $tuple(0, values.pop());
			} finally {
				remaining.push(values.size());
			}
		}

		const first = read(true);
		expect(first[0]).to.equal(4);
		expect(first[1]).to.equal(3);
		expect(failures.size()).to.equal(1);
		const second = read(false);
		expect(second[0]).to.equal(0);
		expect(second[1]).to.equal(2);
		expect(failures.size()).to.equal(0);
		expect(remaining.join(",")).to.equal("2,1");
		expect(values.join(",")).to.equal("1");
	});

	it("should isolate prerequisites in discarded conditional branches", () => {
		const values = [1, 2, 3, 4];
		function discard(enabled: boolean) {
			enabled ? values.pop() : values.shift();
		}

		discard(true);
		expect(values.join(",")).to.equal("1,2,3");
		discard(false);
		expect(values.join(",")).to.equal("2,3");
	});

	it("should evaluate for initializer prerequisites once before the condition", () => {
		const values = [1, 3];
		let index = 0;
		const seen = new Array<number>();
		for (index = values.pop()!; index > 0; index--) {
			expect(values.size()).to.equal(1);
			seen.push(index);
		}

		expect(seen.join(",")).to.equal("3,2,1");
		expect(index).to.equal(0);
		expect(values[0]).to.equal(1);
	});

	it("should evaluate field and parameter prerequisites only during construction", () => {
		const values = [1, 2, 3];
		class Example {
			value = values.pop();
			constructor(readonly other = values.pop()) {}
		}

		expect(values.size()).to.equal(3);
		const first = new Example(10);
		expect(first.other).to.equal(10);
		expect(first.value).to.equal(3);
		const second = new Example();
		expect(second.other).to.equal(2);
		expect(second.value).to.equal(1);
		expect(values.size()).to.equal(0);
	});

	it("should isolate optional calls, macro callbacks, and conditional branches", () => {
		const first = [1, 2];
		const second = [3, 4];
		function run(values: Array<number> | undefined, enabled: boolean) {
			return values?.map(() => (enabled ? first.pop() : second.pop()));
		}

		expect(run(undefined, true)).to.equal(undefined);
		expect(first.size()).to.equal(2);
		expect(second.size()).to.equal(2);
		const a = run([0, 0], true)!;
		expect(a[0]).to.equal(2);
		expect(a[1]).to.equal(1);
		expect(second.size()).to.equal(2);
		const b = run([0, 0], false)!;
		expect(b[0]).to.equal(4);
		expect(b[1]).to.equal(3);
	});

	it("should isolate destructuring defaults from object rest prerequisites", () => {
		const values = [1, 2, 3];
		function read({ value = values.pop(), ...rest }: { value?: number; other: number }) {
			return [value, rest.other];
		}

		const first = read({ other: 4 });
		expect(first[0]).to.equal(3);
		expect(first[1]).to.equal(4);
		const second = read({ value: 5, other: 6 });
		expect(second[0]).to.equal(5);
		expect(second[1]).to.equal(6);
		expect(values.size()).to.equal(2);
	});

	it("should repeat loop prerequisites in order across continue", () => {
		const values = [1, 2, 3];
		const seen = new Array<number>();
		let checks = 0;
		let increments = 0;
		for (; (checks += 1) < 4 && values.pop() !== undefined; increments += 1) {
			if (checks === 2) {
				continue;
			}
			seen.push(checks);
		}

		expect(checks).to.equal(4);
		expect(increments).to.equal(3);
		expect(values.size()).to.equal(0);
		expect(seen.size()).to.equal(2);
		expect(seen[0]).to.equal(1);
		expect(seen[1]).to.equal(3);
	});

	it("should evaluate nested assignment defaults in source order", () => {
		const values = [1, 2, 3, 4];
		let a = 0;
		let b = 0;
		const array: [Array<number>?, { value: number }?] = [];
		[[a] = [values.pop()!], { value: b } = { value: values.pop()! }] = array;
		expect(a).to.equal(4);
		expect(b).to.equal(3);

		const object: { array?: Array<number>; object?: { value: number } } = {};
		({ array: [a] = [values.pop()!], object: { value: b } = { value: values.pop()! } } = object);
		expect(a).to.equal(2);
		expect(b).to.equal(1);
		expect(values.size()).to.equal(0);
	});

	it("should isolate nested binding and rest parameter defaults", () => {
		const values = [1, 2, 3, 4, 5, 6];
		function readArray([[a] = [values.pop()!], { value: b } = { value: values.pop()! }]: [
			Array<number>?,
			{ value: number }?,
		]) {
			return a + b;
		}
		function readObject({ array: [a] = [values.pop()!] }: { array?: Array<number> }) {
			return a;
		}
		function readRest(
			...[a = values.pop()!, [b] = [values.pop()!], { value: c } = { value: values.pop()! }]: [
				number?,
				Array<number>?,
				{ value: number }?,
			]
		) {
			return a + b + c;
		}

		expect(readArray([])).to.equal(11);
		expect(readObject({})).to.equal(4);
		expect(readRest()).to.equal(6);
		expect(values.size()).to.equal(0);
		expect(readArray([[10], { value: 20 }])).to.equal(30);
		expect(readObject({ array: [30] })).to.equal(30);
		expect(readRest(10, [20], { value: 30 })).to.equal(60);
	});

	it("should keep generator assignment prerequisites inside each iteration", () => {
		const values = [1, 2, 3, 4];
		function* arrays(): Generator<[number?]> {
			yield [];
			yield [10];
			yield [];
		}
		function* objects(): Generator<{ value?: number }> {
			yield {};
			yield { value: 20 };
			yield {};
		}
		let value = 0;
		const seen = new Array<number>();
		for ([value = values.pop()!] of arrays()) {
			seen.push(value);
		}
		for ({ value = values.pop()! } of objects()) {
			seen.push(value);
		}

		expect(seen.join(",")).to.equal("4,10,3,2,20,1");
		expect(values.size()).to.equal(0);
	});

	it("should keep array assignment prerequisites inside each iteration", () => {
		const values = [1, 2, 3, 4];
		const arrays: Array<[number?]> = [[], [10], []];
		const objects: Array<{ value?: number }> = [{}, { value: 20 }, {}];
		let value = 0;
		const seen = new Array<number>();
		for ([value = values.pop()!] of arrays) {
			seen.push(value);
		}
		for ({ value = values.pop()! } of objects) {
			seen.push(value);
		}

		expect(seen.join(",")).to.equal("4,10,3,2,20,1");
		expect(values.size()).to.equal(0);
	});

	it("should isolate inline iterator assignment defaults", () => {
		const values = [1, 2, 3];
		let count = 0;
		const iterator = (() => {
			count += 1;
			if (count <= 2) {
				return $tuple(count, undefined, undefined, undefined);
			}
			return $tuple();
		}) as IterableFunction<LuaTuple<[number, number?, Array<number>?, { value: number }?]>>;
		let a = 0;
		let b = 0;
		let c = 0;
		for ([
			,
			a = values.pop() ?? 10,
			[b] = [values.pop() ?? 20],
			{ value: c } = { value: values.pop() ?? 30 },
		] of iterator) {
			if (count === 1) {
				expect(a).to.equal(3);
				expect(b).to.equal(2);
				expect(c).to.equal(1);
			} else {
				expect(a).to.equal(10);
				expect(b).to.equal(20);
				expect(c).to.equal(30);
			}
		}

		expect(count).to.equal(3);
		expect(values.size()).to.equal(0);
	});

	it("should preserve omitted iterable reads and discarded results", () => {
		let calls = 0;
		const iterator = (() => ++calls) as IterableFunction<number>;
		const [, second] = iterator;
		expect(second).to.equal(2);
		expect(calls).to.equal(2);

		const tupleIterator = (() => $tuple(++calls, 10)) as IterableFunction<LuaTuple<[number, number]>>;
		const [, [fourth, value]] = tupleIterator;
		expect(fourth).to.equal(4);
		expect(value).to.equal(10);
		expect(calls).to.equal(4);

		const [, character] = "abc";
		expect(character).to.equal("b");
		const values = [1, 2];
		expect(void values.pop()).to.equal(undefined);
		expect(values.size()).to.equal(1);
	});

	it("should assign generator and map values before the loop body", () => {
		function* numbers() {
			yield 1;
			yield 2;
		}
		let value = 0;
		const seen = new Array<number>();
		for (value of numbers()) {
			seen.push(value);
		}
		expect(seen.join(",")).to.equal("1,2");

		let entry: [string, number] = ["", 0];
		for (entry of new Map([["key", 10]])) {
			expect(entry[0]).to.equal("key");
			expect(entry[1]).to.equal(10);
		}
		expect(entry[0]).to.equal("key");
		expect(entry[1]).to.equal(10);
	});
};
