function difference<T>(set1: Set<T>, set2: Set<T>): Set<T> {
	const result = new Set<T>();
	for (const value of set1) {
		if (!set2.has(value)) {
			result.add(value);
		}
	}
	for (const value of set2) {
		if (!set1.has(value)) {
			result.add(value);
		}
	}
	return result;
}

export = () => {
	it("should retain loop finalizers around empty blocks and branches", () => {
		const callbacks = new Array<() => number>();
		const limit = 3;
		for (let i = 0; i < limit; i++) {
			if (i === 1) {
			}
			{
			}
			callbacks.push(() => i);
		}
		expect(callbacks.map(callback => callback()).join(",")).to.equal("0,1,2");
	});

	it("should iterate inferred tuples through declarations and assignment targets", () => {
		let index = 0;
		function advance() {
			index++;
			assert(index <= 3, "iterator was called after its first return value became nil");
			return $tuple(index <= 2 ? index : undefined, index * 10);
		}
		const iterator = advance as IterableFunction<ReturnType<typeof advance>>;
		let total = 0;
		for (const pair of iterator) {
			total += pair[1];
		}
		expect(total).to.equal(30);

		index = 0;
		let pair: ReturnType<typeof advance>;
		for (pair of iterator) {
			total += pair[1];
		}
		expect(total).to.equal(60);
	});

	it("should run loop increments around empty branches and blocks", () => {
		const limit = 3;
		let visits = 0;
		for (let i = 0; i < limit; i++) {
			if (i === 0) {
			} else {
				visits++;
			}
			{
			}
		}

		expect(visits).to.equal(2);
	});

	it("should finalize captured loop variables before nested continues", () => {
		const values = new Array<() => number>();
		const visited = new Array<number>();
		const limit = 4;
		for (let i = 0; i < limit; i++) {
			values.push(() => i);
			if (i === 0) {
				visited.push(i);
				continue;
			} else if (i === 1) {
				continue;
			} else {
				{
					if (i === 2) {
						continue;
					}
					visited.push(i);
					continue;
				}
			}
		}

		expect(values.map(read => read()).join(",")).to.equal("0,1,2,3");
		expect(visited.join(",")).to.equal("0,3");
	});

	it("should retain the initializer binding captured by a loop initializer", () => {
		const initial = new Array<() => number>();
		const iterations = new Array<() => number>();
		for (let i = 0, read = () => i; i < 3; i++) {
			initial.push(read);
			iterations.push(() => i);
		}

		expect(initial.map(read => read()).join(",")).to.equal("0,0,0");
		expect(iterations.map(read => read()).join(",")).to.equal("0,1,2");
	});

	it("should collect nested loop bindings and omit skipped elements", () => {
		const values = new Array<number>();
		for (let [{ value }, , [other]] = [{ value: 0 }, 100, [2]] as const; value < 2; value++) {
			values.push(value + other);
		}

		expect(values.join(",")).to.equal("2,3");
	});

	it("should retain loops with missing initializers or incrementors", () => {
		const values = new Array<number>();
		for (let i; (i = values.size()) < 2; i++) {
			values.push(i);
		}
		for (let i = 2; i < 4; ) {
			values.push(i++);
		}
		for (let i = 0; i > 10; i++) {
			values.push(100);
		}
		for (let i = 0; i !== 2; i++) {
			values.push(i);
		}

		expect(values.join(",")).to.equal("0,1,2,3,0,1");
	});

	it("should evaluate a negated do-while condition after each iteration", () => {
		let iterations = 0;
		let checks = 0;
		function finished() {
			checks++;
			return iterations === 3 ? "done" : "";
		}

		do {
			iterations++;
		} while (!finished());

		expect(iterations).to.equal(3);
		expect(checks).to.equal(3);
	});

	it("should support numeric separators in loop bounds and steps", () => {
		const ascending = new Array<number>();
		for (let i = 0x0_0; i < 3_0; i += 1_0) {
			ascending.push(i);
		}
		expect(ascending.join(",")).to.equal("0,10,20");

		const descending = new Array<number>();
		for (let i = 3_0; i > 0x0_0; i -= 1_0) {
			descending.push(i);
		}
		expect(descending.join(",")).to.equal("30,20,10");
	});

	it("should preserve negative zero in a loop initializer", () => {
		for (let i = -0; i <= 0; i++) {
			expect(1 / i).to.equal(-math.huge);
		}
	});

	it("should support breaking from a loop with a zero step", () => {
		let iterations = 0;
		for (let i = 0; i < 1; i += 0) {
			iterations++;
			break;
		}
		expect(iterations).to.equal(1);
	});

	it("should reevaluate a changing array-size loop bound", () => {
		const values = [1, 2, 3, 4];
		let iterations = 0;
		for (let i = 0; i < values.size(); i++) {
			values.pop();
			iterations++;
		}
		expect(iterations).to.equal(2);
	});

	it("should reevaluate calls with a numeric literal return type in loop conditions", () => {
		let calls = 0;
		function limit(): 2 {
			calls++;
			return 2;
		}
		for (let i = 0; i < limit(); i++) {}
		expect(calls).to.equal(3);
	});

	it("should preserve loop conditions that compare a different variable", () => {
		let condition = 2;
		let iterations = 0;
		for (let i = 0; condition < 3; i++) {
			condition++;
			iterations++;
		}
		expect(iterations).to.equal(1);
	});

	it("should preserve loop incrementors that decrement a different variable", () => {
		let remaining = 3;
		for (let i = 3; i > 0; remaining -= 1) {
			if (remaining === 1) break;
		}
		expect(remaining).to.equal(1);
	});

	it("should preserve destructuring writes to the loop variable", () => {
		let iterations = 0;
		for (let i = 0; i < 3; i++) {
			[i] = [5];
			iterations++;
		}
		expect(iterations).to.equal(1);
	});

	it("should support numeric for loops", () => {
		const hit = new Set<number>();
		let sum = 10;
		for (let i = 0; i < 10; i++) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});

	it("should support optimized simple loops #1", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 1; i <= 3; i++) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #2", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 3; i >= 1; i--) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #3", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 1; i <= 3; i = i + 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #4", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 3; i >= 1; i = i - 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #5", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 1; i <= 3; i += 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #6", () => {
		const hit = new Set<number>();
		const limit = 1;
		let n = 0;
		for (let i = 3; i >= limit; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #7", () => {
		const hit = new Set<number>();
		const limit = 1;
		let n = 0;
		for (let i = 3; i <= limit; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(0);
		expect(hit.has(1)).to.equal(false);
		expect(hit.has(2)).to.equal(false);
		expect(hit.has(3)).to.equal(false);

		for (let i = 3; i >= limit; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #8", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 3; i <= 1; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(0);
		expect(hit.has(1)).to.equal(false);
		expect(hit.has(2)).to.equal(false);
		expect(hit.has(3)).to.equal(false);

		for (let i = 3; i >= 1; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support for-of loops over arrays", () => {
		const hit = new Set<string>();
		const array = ["1", "2", "3", "4"];
		let n = 0;
		for (const v of array) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over array literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of ["1", "2", "3", "4"]) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over string literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of "1234") {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over strings", () => {
		const hit = new Set<string>();
		const str = "1234";
		let n = 0;
		for (const v of str) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over computed strings", () => {
		const i = 0;
		for (const letter of `${i}s`) {
		}
	});

	it("should support for-of loops over Set literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of new Set(["1", "2", "3", "4"])) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over Sets", () => {
		const hit = new Set<string>();
		const set = new Set(["1", "2", "3", "4"]);
		let n = 0;
		for (const v of set) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over Map literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of new Map([
			["1", "2"],
			["3", "4"],
		])) {
			hit.add(v[0]);
			hit.add(v[1]);
			n++;
		}
		expect(n).to.equal(2);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over Maps", () => {
		const hit = new Set<string>();
		const map = new Map([
			["1", "2"],
			["3", "4"],
		]);
		let n = 0;
		for (const v of map) {
			hit.add(v[0]);
			hit.add(v[1]);
			n++;
		}
		expect(n).to.equal(2);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support optimized destructuring in for-of loops over Maps", () => {
		const hit = new Set<string>();
		const map = new Map([
			["1", "2"],
			["3", "4"],
		]);
		let n = 0;
		for (const [k, v] of map) {
			hit.add(k);
			hit.add(v);
			n++;
		}
		expect(n).to.equal(2);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support destructuring optimized destructuring in for-of loops over Maps", () => {
		let n = 0;
		for (const [[i, j], [k, v]] of new Map<[string, string], [string, string]>([
			[
				["1", "2"],
				["3", "4"],
			],
		])) {
			expect(i).to.equal("1");
			expect(j).to.equal("2");
			expect(k).to.equal("3");
			expect(v).to.equal("4");
			n++;
		}
		expect(n).to.equal(1);
	});

	it("should support break", () => {
		const array = [1, 2, 3, 4, 5];
		let sum = 0;
		for (const value of array) {
			sum += value;
			if (value === 3) {
				break;
			}
		}
		expect(sum).to.equal(6);
	});

	it("should support continue", () => {
		const array = [1, 2, 3, 4];
		let sum = 0;
		for (const value of array) {
			if (value === 3) {
				continue;
			}
			sum += value;
		}
		expect(sum).to.equal(7);
	});

	it("should support continue with numeric loops", () => {
		let x = 0;
		for (let i = 0; i < 10; i++) {
			if (i % 2 === 0) {
				continue;
			}
			x++;
		}
		expect(x).to.equal(5);
	});

	it("should support do-while loops", () => {
		let x = 0;
		do {
			x += 5;
		} while (x < 25);
		expect(x).to.equal(25);

		function expect0(y: number) {
			expect(y).to.equal(0);
			return false;
		}

		const y = 0;
		do {
			const y = 1;
			expect(y).to.equal(1);
		} while (expect0(y));
	});

	it("should support while loops", () => {
		let x = 0;
		while (x < 10) {
			x++;
		}
		expect(x).to.equal(10);
	});

	it("should support for-of destructuring", () => {
		const arr = [
			{
				a: 1,
				b: 2,
				c: 3,
			},
		];
		for (const { a, b, c } of arr) {
			expect(a).to.equal(1);
			expect(b).to.equal(2);
			expect(c).to.equal(3);
		}
	});

	it("should work with gmatch", () => {
		for (const [a] of "H".gmatch(".")) {
			expect(a).to.equal("H");
		}

		for (const [a, b, c, d] of "Hello!".gmatch("(%l)(%l)(%l)(%l)")) {
			expect(a).to.equal("e");
			expect(b).to.equal("l");
			expect(c).to.equal("l");
			expect(d).to.equal("o");
		}
	});

	it("should support indexing tuple as array", () => {
		const obj = {
			a: 1,
			b: 2,
			c: 3,
		};

		for (const tuple of pairs(obj)) {
			expect(tuple[1]).to.equal(obj[tuple[0]]);
		}
	});

	it("should support iterator function with single return when indexing tuple as array", () => {
		const shortIterator: IterableFunction<LuaTuple<[value: boolean]>> = (() =>
			[true] as LuaTuple<[value: boolean]>) as never;

		for (const tuple of shortIterator) {
			expect(tuple.size()).to.equal(1);
			break;
		}
	});

	it("should support iterator function with multiple returns when indexing tuple as array", () => {
		const longIterator: IterableFunction<LuaTuple<[boolean, boolean, boolean, boolean, boolean, boolean]>> = (() =>
			[true, true, true, true, true, true] as LuaTuple<
				[boolean, boolean, boolean, boolean, boolean, boolean]
			>) as never;
		for (const tuple of longIterator) {
			expect(tuple.size()).to.equal(6);
			break;
		}
	});

	it("should support iterator function with rest tuple elements when indexing as array", () => {
		let callCount = 0;
		const restIterator: IterableFunction<LuaTuple<[number, ...number[]]>> = (() => {
			callCount++;
			if (callCount === 1) {
				return [10, 20, 30] as unknown as LuaTuple<[number, ...number[]]>;
			}
			return undefined as unknown as LuaTuple<[number, ...number[]]>;
		}) as never;

		for (const tuple of restIterator) {
			expect(tuple.size()).to.equal(3);
			expect(tuple[0]).to.equal(10);
			expect(tuple[1]).to.equal(20);
			expect(tuple[2]).to.equal(30);
			break;
		}
	});

	it("should support iterator function with variadic tuple elements when indexing as array", () => {
		function collectFirst<T extends unknown[]>(
			iter: IterableFunction<LuaTuple<[number, ...T]>>,
		): Array<unknown> | undefined {
			for (const entry of iter) {
				return entry as unknown as Array<unknown>;
			}
			return undefined;
		}

		let callCount = 0;
		const iter: IterableFunction<LuaTuple<[number, number, number]>> = (() => {
			callCount++;
			if (callCount === 1) {
				return [10, 20, 30] as LuaTuple<[number, number, number]>;
			}
			return undefined as unknown as LuaTuple<[number, number, number]>;
		}) as never;

		const result = collectFirst<[number, number]>(iter);
		expect(result).to.be.ok();
		expect(result!.size()).to.equal(3);
		expect(result![0]).to.equal(10);
		expect(result![1]).to.equal(20);
		expect(result![2]).to.equal(30);
	});

	it("should support the $range macro without step", () => {
		const hit = new Set<number>();
		let sum = 10;
		for (const i of $range(0, 9)) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});

	it("should support the $range macro with a negative step", () => {
		const hit = new Set<number>();
		let sum = 10;
		for (const i of $range(9, 0, -1)) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});

	it("should support the $range macro with a decimal step", () => {
		const hit = new Set<number>();
		let sum = 19;
		for (const i of $range(0, 9, 0.5)) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(0.5)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(1.5)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(2.5)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(3.5)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(4.5)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(5.5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(6.5)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(7.5)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(8.5)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});
};
